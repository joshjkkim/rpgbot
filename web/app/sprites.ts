/**
 * Pixel-art sprites for the landing page, drawn as character grids: each
 * character is one pixel, looked up in PALETTE, and "." is transparent.
 */

export const PALETTE: Record<string, string> = {
  o: "#5a3e1a", // gold outline
  y: "#d9a441", // gold
  h: "#f2d27a", // gold highlight
  d: "#a8722e", // gold shade
  w: "#e9dcb4", // bone / parchment light
  p: "#d8c08a", // parchment
  q: "#a88a52", // parchment shade
  k: "#1a1214", // near black
  s: "#c9ccd4", // steel
  t: "#7d8290", // steel shade
  b: "#7a4a24", // wood
  n: "#4a2c14", // dark wood
  r: "#9a3b2c", // red
  g: "#6fa35a", // green
  e: "#3f6b34", // green shade
};

export const SPRITES = {
  coin: [
    "....oooo....",
    "..ooyyyyoo..",
    ".oyhhyyyyyo.",
    ".oyhyyyyydo.",
    "oyhyyddyyydo",
    "oyhyydyyyydo",
    "oyyyydyyyydo",
    "oyyyyddyyddo",
    ".oyyyyyyddo.",
    ".odyyyyyddo.",
    "..ooddddoo..",
    "....oooo....",
  ],
  skull: [
    "............",
    "...wwwwww...",
    "..wwwwwwww..",
    ".wwwwwwwwwq.",
    ".wwwwwwwwwq.",
    ".wkkkwwkkkq.",
    ".wkkkwwkkkq.",
    ".wwwwkkwwwq.",
    "..wwwwwwqq..",
    "...wkwkwk...",
    "...wwwwww...",
    "............",
  ],
  scroll: [
    "............",
    ".qppppppppq.",
    "qwwwwwwwwwwq",
    ".qppppppppq.",
    "..pqqqqqqp..",
    "..pppppppp..",
    "..pqqqqqpp..",
    "..pppppppp..",
    "..pqqqqrrp..",
    ".qppppprrpq.",
    "qwwwwwwwwwwq",
    ".qppppppppq.",
  ],
  chest: [
    "............",
    "..nnnnnnnn..",
    ".nbbbbbbbbn.",
    ".nbbbbbbbbn.",
    ".nbbbbbbbbn.",
    ".yyyyyyyyyy.",
    ".nbbbyybbbn.",
    ".nbbbykbbbn.",
    ".nbbbbbbbbn.",
    ".nbbbbbbbbn.",
    ".nnnnnnnnnn.",
    "............",
  ],
  swords: [
    "s..........s",
    "ts........st",
    ".ts......st.",
    "..ts....st..",
    "...ts..st...",
    "....tsst....",
    "....stts....",
    "...yt..ty...",
    "..yny..yny..",
    ".n..y..y..n.",
    "o..........o",
    "............",
  ],
  potion: [
    "....nnnn....",
    ".....bb.....",
    ".....ww.....",
    "....wggw....",
    "...wggggw...",
    "..wggwgggw..",
    ".wgwggggeew.",
    ".wggggggeew.",
    ".wgggggeeew.",
    "..wgeeeeew..",
    "...wwwwww...",
    "............",
  ],
  star: [
    ".....oo.....",
    ".....yo.....",
    "....oyyo....",
    "....ohyo....",
    "ooooohyyoooo",
    "oyhhhhyyyydo",
    ".oyhyyyyydo.",
    "..oyyyyydo..",
    "..oyyddydo..",
    ".oyydoodydo.",
    ".oydo..odyo.",
    ".oo......oo.",
  ],
  trophy: [
    "............",
    "oooooooooooo",
    "oyhhyyyyydyo",
    "oyhyyyyyydyo",
    ".oyhyyyyddo.",
    "..oyyyyydo..",
    "...ooyydo...",
    ".....oyo....",
    ".....oyo....",
    "....oyyyo...",
    "...oddddddo.",
    "...oooooooo.",
  ],
  palette: [
    "............",
    "...qqqqqq...",
    "..qppppppq..",
    ".qpprppgppq.",
    ".qpppppppppq",
    "qppyppppkkpq",
    "qpppppppkkq.",
    "qptpppppqq..",
    ".qppppppq...",
    "..qppppppq..",
    "...qqqqqq...",
    "............",
  ],
  book: [
    "............",
    ".nnnnnnnnnn.",
    ".nrrrrrrrrnw",
    ".nrryyyyrrnw",
    ".nrrrrrrrrnw",
    ".nrryyyrrrnw",
    ".nrrrrrrrrnw",
    ".nrrrrrrrrnw",
    ".nrrrrrrrrnw",
    ".nnnnnnnnnnw",
    "..wwwwwwwwww",
    "............",
  ],
} satisfies Record<string, string[]>;

export type SpriteName = keyof typeof SPRITES;

/** Campfire flame, three frames shown in turn. 7 wide, 10 tall, base on the logs. */
export const FLAME_FRAMES = [
  [
    "...r...",
    "...r...",
    "..ryr..",
    "..ryr..",
    ".rryrr.",
    ".ryhyr.",
    "rryhyrr",
    "ryhhhyr",
    "ryhhhyr",
    ".ryyyr.",
  ],
  [
    ".......",
    "....r..",
    "...rr..",
    "..ryr..",
    ".rryr..",
    ".ryhyr.",
    ".ryhyrr",
    "rryhhyr",
    "ryhhhyr",
    ".ryyyr.",
  ],
  [
    ".......",
    "..r....",
    "..rr...",
    "..ryr..",
    "..ryrr.",
    ".ryhyr.",
    "rryhyr.",
    "ryhhyrr",
    "ryhhhyr",
    ".ryyyr.",
  ],
];
