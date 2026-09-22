import { getLocale } from "@/i18n";
import type { BotDefinition, ChatMessages } from "./types";

const CHAT_EN: ChatMessages = {
  start: [
    "Bzzz. Ready for chess straight from 163,903 neurons?",
    "My eyes see 64 squares. All of them at once. Also the ceiling.",
    "Bzz! Let's play. My brain is the size of a poppy seed, but very motivated.",
    "I've been training for 7 hours. That's roughly 3% of my life expectancy.",
    "Fun fact: I taste with my feet. This board tastes like a draw.",
    "Please don't reach for the newspaper. I'm here to play chess.",
    "Six legs, zero hands. I move the pieces with pure neural activity.",
  ],
  capture: [
    "Bzz!", "Yum.", "That one lit up my optic lobe.",
    "Mine now. Finders keepers.",
    "I'll keep that for later. Next to the banana.",
    "Nom nom. Wood tastes better than fruit, surprisingly.",
    "My mushroom body is very pleased with this.",
    "",
  ],
  blunder: [
    "My descending neurons have doubts about that move.",
    "Bzz? Really?",
    "I smell an opportunity. Also fruit. Mostly the opportunity.",
    "Even my ventral nerve cord saw that one coming.",
    "Are you sure? I have compound eyes and I'm still squinting.",
    "Thank you for the gift. I'll write you a thank-you buzz.",
  ],
  trouble: [
    "My value head does not like this.",
    "Less dopamine now…",
    "Bzz… it's getting hot.",
    "I'd fly away, but I promised to finish the game.",
    "Hold on, recalibrating 6,235,682 synapses.",
    "This is fine. Everything is fine. Bzz.",
  ],
  brilliantMove: [
    "I did not predict that reply.",
    "Prediction error. Interesting.",
    "That move went through all 10 of my steps.",
    "Wait, humans can do that?",
    "My neurons are writing that one down.",
  ],
  win: [
    "Small pain early, big reward later.",
    "Bzzzz! A win. Somebody tell the banana.",
    "Checkmated by an insect. Don't worry, I won't tell anyone. Bzz.",
    "GG. I'm celebrating with a tiny drop of juice.",
  ],
  loss: [
    "Noted. My synapses will remember.",
    "Good game. Bzz.",
    "You win this time. I'll be back with more training data.",
    "Defeated by a primate. Respect.",
    "I blame the 14 squares I can't see very well.",
  ],
  idle: [
    "…", "Bzz.",
    "Thinking with my whole mushroom body.",
    "Take your time. I live about 50 days, no pressure.",
    "*rubs front legs together thoughtfully*",
    "Is that a fruit bowl? No, focus. Chess.",
    "My brain has 163,903 neurons and all of them are waiting for you.",
    "Did you know I can see ultraviolet? Your move looks very UV right now.",
    "",
  ],
};

const CHAT_PL: ChatMessages = {
  start: [
    "Bzzz. Gotowy na szachy prosto z 163 903 neuronów?",
    "Moje oczy widzą 64 pola. Wszystkie naraz. I jeszcze sufit.",
    "Bzz! Zagrajmy. Mam mózg wielkości ziarnka maku, ale bardzo zmotywowany.",
    "Trenowałam 7 godzin. To jakieś 3% mojego życia.",
    "Ciekawostka: smak czuję nogami. Ta plansza smakuje jak remis.",
    "Proszę, odłóż gazetę. Przyszłam tu grać w szachy.",
    "Sześć nóg, zero rąk. Figury przesuwam czystą aktywnością neuronów.",
  ],
  capture: [
    "Bzz!", "Mniam.", "To rozświetliło mi płat wzrokowy.",
    "Teraz moje. Kto znalazł, ten ma.",
    "Schowam to na później. Obok banana.",
    "Mniam mniam. Drewno smakuje lepiej niż owoce, kto by pomyślał.",
    "Moje ciało grzybkowate jest bardzo zadowolone.",
    "",
  ],
  blunder: [
    "Moje neurony zstępujące mają co do tego wątpliwości.",
    "Bzz? Serio?",
    "Czuję okazję. I trochę owoców. Ale głównie okazję.",
    "Nawet mój rdzeń brzuszny to przewidział.",
    "Na pewno? Mam oczy złożone i dalej mrużę.",
    "Dziękuję za prezent. Wyślę ci bzyczącą kartkę.",
  ],
  trouble: [
    "Moja głowica wartości tego nie lubi.",
    "Mniej dopaminy…",
    "Bzz… robi się gorąco.",
    "Odleciałabym, ale obiecałam dokończyć partię.",
    "Chwila, kalibruję 6 235 682 synapsy.",
    "Jest dobrze. Wszystko jest dobrze. Bzz.",
  ],
  brilliantMove: [
    "Nie przewidziałam tej odpowiedzi.",
    "Błąd predykcji. Ciekawe.",
    "Ten ruch przeszedł mi przez wszystkie 10 kroków.",
    "Chwila, ludzie tak potrafią?",
    "Moje neurony to sobie zapisują.",
  ],
  win: [
    "Mały ból na początku, duża nagroda na końcu.",
    "Bzzzz! Wygrana. Niech ktoś powie bananowi.",
    "Mat od owada. Spokojnie, nikomu nie powiem. Bzz.",
    "GG. Świętuję malutką kropelką soku.",
  ],
  loss: [
    "Zanotowane. Moje synapsy zapamiętają.",
    "Dobra partia. Bzz.",
    "Tym razem wygrałeś. Wrócę z większą ilością danych treningowych.",
    "Pokonana przez naczelnego. Szacunek.",
    "To wina tych 14 pól, których słabo widzę.",
  ],
  idle: [
    "…", "Bzz.",
    "Myślę całym ciałem grzybkowatym.",
    "Nie spiesz się. Żyję jakieś 50 dni, żadnej presji.",
    "*zaciera przednie nóżki w zamyśleniu*",
    "Czy to miska z owocami? Nie, skup się. Szachy.",
    "Mam 163 903 neurony i wszystkie czekają na ciebie.",
    "Wiesz, że widzę ultrafiolet? Twój ruch wygląda teraz bardzo UV.",
    "",
  ],
};

/**
 * The only opponent in Fly Chess. Moves come from a rate model running on the
 * real MaleCNS v1.0 wiring diagram (163,903 neurons), with synaptic gains and
 * the readout trained on Stockfish 19 analysis.
 */
export const fly: BotDefinition = {
  id: "fly",
  get name() {
    return getLocale() === "pl" ? "Mucha" : "Fly";
  },
  title: "The Living Connectome",
  game: "MaleCNS v1.0",
  elo: 1340,
  personality: "adaptive",
  thinkDelay: 1200,
  get chat() {
    return getLocale() === "pl" ? CHAT_PL : CHAT_EN;
  },
  avatarUrl: "avatars/fly.svg",
  description:
    "A real fruit-fly wiring diagram playing chess. It sees the board through its optic lobes, imagines continuations and judges them with its own value heads. Taught by Stockfish.",
  traits: ["Real connectome", "Plans ahead", "Trained by Stockfish"],
  taglines: {
    win: "Patience pays. Bzz.",
    lose: "My synapses will remember this.",
    draw: "A balanced prediction.",
  },
  palette: {
    bgPrimary: "#302e2b",
    boardLight: "#ebecd0",
    boardDark: "#739552",
    accent: "#81b64c",
  },
};
