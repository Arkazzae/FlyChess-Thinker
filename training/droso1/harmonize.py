"""Use the same teacher root and node budget for every compared move at each FEN.

The original evaluator strengthens root+chosen together on ambiguous cases.
Different chosen moves can trigger different budgets. This postprocessing
raises all compared moves to the maximum requested budget for that position,
preserving original assessments and inference results in their own directories.
"""
import argparse
import hashlib
import json
from pathlib import Path

from droso1.common import BASE,now,sha256,write_json
from droso1.comparison import compare
from droso1.teacher import Teacher,score_regret,summarize


def shared_budgets(evaluations):
    reference=evaluations[0]
    fields=('split','positions','data_file_sha256','simulations','c_puct','teacher_nodes','engine_sha256')
    coordinates=lambda e:[(r['index'],r['key'],r['group'],r['fen']) for r in e['positions']]
    for candidate in evaluations:
        if any(candidate['identity'][k]!=reference['identity'][k] for k in fields) or coordinates(candidate)!=coordinates(reference):
            raise ValueError('shared teacher budgets require aligned positions and settings')
        for row in candidate['positions']:
            if row['root']['nodes']!=row['chosen']['nodes']:
                raise ValueError('each original root/chosen analysis must already share a budget')
    return [max(e['positions'][i]['root']['nodes'] for e in evaluations) for i in range(len(reference['positions']))]


def harmonize(inputs,out,cache):
    loaded={name:json.loads(path.read_text()) for name,path in inputs.items()}
    budgets=shared_budgets(list(loaded.values()))
    budget_hash=hashlib.sha256(json.dumps(budgets).encode()).hexdigest()
    out.mkdir(parents=True,exist_ok=True)
    teacher=Teacher(cache)
    results={}
    try:
        if teacher.engine_hash!=next(iter(loaded.values()))['identity']['engine_sha256']:
            raise ValueError('teacher engine changed since the original assessments')
        for name,evaluation in loaded.items():
            positions=[];upgraded=0
            for row,nodes in zip(evaluation['positions'],budgets):
                if row['root']['nodes']<nodes:
                    root=teacher.analyse(row['fen'],nodes=nodes)
                    chosen=teacher.analyse(row['fen'],row['move'],nodes=nodes)
                    row=row|score_regret(root,chosen)|dict(root=root,chosen=chosen,confirmed=True)
                    upgraded+=1
                positions.append(row)
            result=dict(identity=evaluation['identity']|dict(original_name=evaluation['identity']['name'],name=name,
                        common_teacher_budgets_sha256=budget_hash,harmonization_code_sha256=sha256(__file__)),
                        positions=positions,summary=summarize(positions),upgraded_positions=upgraded,
                        source_file=str(inputs[name]),source_file_sha256=sha256(inputs[name]))
            result['strata']={s:summarize([r for r in positions if r['stratum']==s]) for s in ('quiet','tactical','endgame')}
            results[name]=result
            write_json(out/f'{name}-regret.json',result)
            print(json.dumps(dict(model=name,upgraded_positions=upgraded,summary=result['summary'])),flush=True)
        # Every model must now be evaluated against exactly the same root analysis.
        first=next(iter(results.values()))['positions']
        for result in results.values():
            if [r['root'] for r in result['positions']]!=[r['root'] for r in first]:
                raise ValueError('teacher root differs after budget harmonization')
        report=dict(stage='completed',created_at=now(),common_teacher_budgets_sha256=budget_hash,
                    budgets=budgets,regret={name:r['summary']|dict(strata=r['strata']) for name,r in results.items()},
                    models={name:r['identity'] for name,r in results.items()},
                    note='Inference unchanged. Teacher root and chosen-move budgets are now identical across models at each position. Original adaptive-budget reports are preserved.')
        if len(results)==2:
            names=list(results)
            report['paired_detail']=compare(results[names[0]],results[names[1]])
        write_json(out/'report.json',report)
        return report
    finally:teacher.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',action='append',required=True,help='unique_label=regret.json')
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--cache',type=Path,default=BASE/'data/droso-1/teacher-cache.sqlite')
    args=parser.parse_args()
    inputs={}
    for item in args.input:
        name,path=item.split('=',1)
        if not name.replace('_','').isalnum() or name in inputs:parser.error('distinct alphanumeric/underscore labels required')
        inputs[name]=Path(path)
    harmonize(inputs,args.out,args.cache)
