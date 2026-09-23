"""Regression for retaining later error supervision at duplicate positions."""
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from droso1.data import PACKED, SOURCES
from droso1.reindex import reindex


class SupervisionDedupTest(unittest.TestCase):
    def test_later_pain_and_real_context_survive_global_dedup(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            (root/'parts').mkdir();(root/'train').mkdir()
            parts=[]
            def part(number,source,keys,pain=False,context=False):
                rows=np.zeros(len(keys),dtype=PACKED)
                rows['key']=[bytes([key])*16 for key in keys]
                rows['source']=SOURCES.index(source)
                rows['blunder']=14 if pain else -1
                rows['reply']=-1;rows['weight']=1
                rows['value_mask'][:,0]=1
                rows['value_mask'][:,2]=int(context)
                path=f'parts/{number:04d}.npy'
                np.save(root/path,rows)
                parts.append(dict(file=path,source=source))
            part(0,'dagger',[1,2])
            part(1,'dagger',[1,3],pain=True)
            part(2,'generated',[2,4],context=True)
            part(3,'lichess',[1,2,3,4,5])
            (root/'manifest.json').write_text(json.dumps(dict(prepared_sources=parts)))
            result=reindex(root)
            self.assertEqual(result['unique_train_records'],5)
            self.assertEqual(result['source_counts'],dict(lichess=1,dagger=2,generated=2))
            self.assertEqual(result['valid_labels']['pain'],2)
            self.assertEqual(result['valid_labels']['2'],2)
            rows=np.concatenate([np.load(root/item['file']) for item in result['train']])
            self.assertEqual(len(np.unique(rows['key'])),len(rows))
            for source in SOURCES:
                indices=np.load(root/f'indices-{source}.npy')
                np.testing.assert_array_equal(indices,np.flatnonzero(rows['source']==SOURCES.index(source)))
            again=reindex(root)
            self.assertEqual(again,result)


if __name__=='__main__':
    unittest.main()
