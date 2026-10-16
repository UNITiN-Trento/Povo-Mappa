// Definizione schematica dei piani. Coordinate in unità del viewBox SVG.
// `code` è il codice aula di EasyAcademy (null = non prenotabile / nessun dato).
// Le posizioni seguono le mappe di riferimento (Povo 1: mappa @povo.rotta, Povo 2: mappa piano 0).

const FLOORS = [
  {
    id: 'povo1-t',
    building: 'Povo 1',
    name: 'Piano terra',
    hint: '-1 su ascensore · Via Sommarive 9',
    viewBox: '90 50 680 510',
    outline: [{ x: 100, y: 60, w: 660, h: 370 }, { x: 100, y: 440, w: 660, h: 70 }],
    corridors: [
      { x: 235, y: 70, w: 380, h: 70 },
      { x: 235, y: 70, w: 20, h: 350 },
      { x: 610, y: 70, w: 10, h: 350 },
      { x: 110, y: 350, w: 640, h: 70 },
    ],
    rooms: [
      { code: 'E0503/A106', label: 'A106', x: 110, y: 70, w: 120, h: 65 },
      { code: 'E0503/A105', label: 'A105', x: 110, y: 140, w: 120, h: 65 },
      { code: 'E0503/A104', label: 'A104', x: 110, y: 210, w: 120, h: 65 },
      { code: 'E0503/A103', label: 'A103', x: 110, y: 280, w: 120, h: 65 },
      { code: 'E0503/A109', label: 'A109', x: 350, y: 70, w: 75, h: 50 },
      { code: 'E0503/A110', label: 'A110', x: 430, y: 70, w: 75, h: 50 },
      { code: 'E0503/A107', label: 'A107', x: 262, y: 175, w: 60, h: 100 },
      { code: 'E0503/A108', label: 'A108', x: 545, y: 175, w: 60, h: 100 },
      { code: 'E0503/A101', label: 'A101', sub: 'aula magna', x: 625, y: 70, w: 125, h: 115 },
      { code: 'E0503/A102', label: 'A102', x: 625, y: 190, w: 125, h: 100 },
      { code: 'E0503/A12', label: 'Aula studio', kind: 'study', x: 330, y: 145, w: 210, h: 25, small: true },
      { code: 'E0503 cortile P1', label: 'Cortile interno', kind: 'open', x: 330, y: 175, w: 210, h: 125 },
    ],
    areas: [
      { label: 'Portineria', x: 340, y: 355, w: 80, h: 22 },
      { label: '', kind: 'entrance', x: 330, y: 440, w: 120, h: 70 },
    ],
    texts: [
      { text: 'Aule "B" → Povo 2', x: 690, y: 545, size: 16, weight: 700 },
      { text: 'Ingresso', x: 390, y: 545, size: 18, weight: 700 },
    ],
    arrows: [{ x1: 390, y1: 520, x2: 390, y2: 480 }],
  },
  {
    id: 'povo1-1',
    building: 'Povo 1',
    name: 'Primo piano',
    hint: '0 su ascensore · Via Sommarive 9',
    viewBox: '90 50 680 510',
    outline: [{ x: 100, y: 60, w: 660, h: 370 }, { x: 100, y: 440, w: 660, h: 70 }],
    corridors: [
      { x: 110, y: 350, w: 640, h: 70 },
      { x: 235, y: 70, w: 400, h: 330 },
    ],
    rooms: [
      { code: 'E0503/A208', label: 'A208', x: 110, y: 70, w: 120, h: 62 },
      { code: 'E0503/A207', label: 'A207', x: 110, y: 137, w: 120, h: 62 },
      { code: 'E0503/A206', label: 'A206', x: 110, y: 204, w: 120, h: 62 },
      { code: 'E0503/A205', label: 'A205', x: 110, y: 271, w: 120, h: 62 },
      { code: 'E0503/A204', label: 'A204', x: 110, y: 338, w: 120, h: 62 },

      { code: 'E0503/A221', label: 'A221', x: 305, y: 70, w: 64, h: 50 },
      { code: 'E0503/A222', label: 'A222', x: 374, y: 70, w: 64, h: 50 },
      { code: 'E0503/A223', label: 'A223', x: 443, y: 70, w: 64, h: 50 },
      { code: 'E0503/A224', label: 'A224', x: 512, y: 70, w: 64, h: 50 },

      { code: 'E0503/A220', label: 'A220', x: 305, y: 149, w: 64, h: 42 },
      { code: 'E0503/A219', label: 'A219', x: 374, y: 149, w: 64, h: 42 },
      { code: 'E0503/A218', label: 'A218', x: 443, y: 149, w: 64, h: 42 },
      { code: 'E0503/A217', label: 'A217', x: 512, y: 149, w: 64, h: 42 },

      { code: 'E0503/A213', label: 'A213', x: 305, y: 271, w: 64, h: 45 },
      { code: 'E0503/A214', label: 'A214', x: 374, y: 271, w: 64, h: 45 },
      { code: 'E0503/A215', label: 'A215', x: 443, y: 271, w: 64, h: 45 },
      { code: 'E0503/A216', label: 'A216', x: 512, y: 271, w: 64, h: 45 },

      { code: 'E0503/A212', label: 'A212', x: 305, y: 345, w: 64, h: 55 },
      { code: 'E0503/A211', label: 'A211', x: 374, y: 345, w: 64, h: 55 },
      { code: 'E0503/A210', label: 'A210', x: 443, y: 345, w: 64, h: 55 },
      { code: 'E0503/A209', label: 'A209', x: 512, y: 345, w: 64, h: 55 },

      { code: null, label: 'LAB', kind: 'dark', x: 650, y: 70, w: 100, h: 120 },
      { code: 'E0503/A201', label: 'A201', sub: 'sala pc', x: 650, y: 195, w: 100, h: 60 },
      { code: 'E0503/A202', label: 'A202', sub: 'sala pc', x: 650, y: 260, w: 100, h: 60 },
      { code: 'E0503/A203', label: 'A203', x: 650, y: 325, w: 100, h: 75 },
    ],
    areas: [
      { label: 'Cortile interno', kind: 'study', x: 310, y: 196, w: 261, h: 70 },
      { label: 'Uff. Rappr.', kind: 'study', x: 254, y: 186, w: 44, h: 90, vertical: true },
      { label: 'Studio PC', kind: 'study', x: 583, y: 186, w: 44, h: 90, vertical: true },
      { label: '', kind: 'entrance', x: 330, y: 440, w: 120, h: 70 },
    ],
    texts: [{ text: 'Ingresso', x: 390, y: 545, size: 18, weight: 700 }],
    arrows: [{ x1: 390, y1: 520, x2: 390, y2: 480 }],
  },
  {
    id: 'povo2-0',
    building: 'Povo 2',
    name: 'Piano 0',
    hint: 'Via Sommarive 14',
    viewBox: '100 60 800 605',
    outline: [{ x: 110, y: 70, w: 780, h: 370 }],
    corridors: [
      { x: 230, y: 80, w: 550, h: 350 },
      { x: 120, y: 80, w: 760, h: 60 },
    ],
    rooms: [
      { code: 'E0503/B109', label: 'B109', x: 125, y: 155, w: 95, h: 100 },
      { code: 'E0503/B108', label: 'B108', x: 125, y: 260, w: 95, h: 50 },
      { code: 'E0503/B106', label: 'B106', sub: 'pc', x: 125, y: 315, w: 95, h: 115 },
      { code: 'E0503/B110', label: 'B110', x: 335, y: 310, w: 42, h: 62, vertical: true },
      { code: 'E0503/B111', label: 'B111', x: 380, y: 310, w: 42, h: 62, vertical: true },
      { code: 'E0503/B112', label: 'B112', x: 425, y: 310, w: 42, h: 62, vertical: true },
      { code: 'E0503/B107', label: 'B107', sub: 'sala conferenze', x: 615, y: 455, w: 115, h: 175 },
      { code: 'E0503 atrio P2', label: 'Atrio - Tavoloni Studio', kind: 'open', x: 295, y: 385, w: 410, h: 45 },
    ],
    areas: [
      { label: 'Portineria', x: 296, y: 310, w: 35, h: 62, vertical: true },
      { label: 'Cortile interno', kind: 'study', x: 295, y: 205, w: 410, h: 100 },
      { label: '', kind: 'entrance', x: 280, y: 455, w: 115, h: 175 },
    ],
    texts: [
      { text: 'Ingresso', x: 337, y: 655, size: 18, weight: 700 },
    ],
    arrows: [{ x1: 337, y1: 615, x2: 337, y2: 560 }],
  },
];
