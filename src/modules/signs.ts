// Panneaux routiers français dessinés en SVG (dessins simplifiés, d'après les formes et couleurs réglementaires).
// Chaque fonction renvoie un bloc HTML sur une seule ligne (pas de ligne vide : le bloc reste intact en Markdown).
// L'étiquette accessible reste neutre (« Panneau routier ») pour ne pas souffler la réponse.

const RED = '#d3172e'
const BLUE = '#1e63b4'
const INK = '#1a1a1a'
const YELLOW = '#f6b200'
const GREY = '#8a8a8a'
const FONT = 'font-family="Arial, Helvetica, sans-serif" font-weight="700" text-anchor="middle"'

function wrap(inner: string, wide = false): string {
  const box = wide ? '166 100' : '100 100'
  return `<div class="sign-wrap"><svg class="sign${wide ? ' wide' : ''}" viewBox="0 0 ${box}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Panneau routier">${inner}</svg></div>`
}

// ---------- Formes ----------
const danger = (sym: string, fill = '#fff') =>
  wrap(`<polygon points="50,8 94,88 6,88" fill="${fill}" stroke="${RED}" stroke-width="8" stroke-linejoin="round"/>${sym}`)
const prohibition = (sym: string) => wrap(`<circle cx="50" cy="50" r="43" fill="#fff" stroke="${RED}" stroke-width="10"/>${sym}`)
const obligation = (sym: string) => wrap(`<circle cx="50" cy="50" r="46" fill="${BLUE}" stroke="#fff" stroke-width="3"/>${sym}`)
const square = (sym: string) => wrap(`<rect x="5" y="5" width="90" height="90" rx="10" fill="${BLUE}" stroke="#fff" stroke-width="3"/>${sym}`)
/** Fin d'interdiction : disque blanc, symbole gris, bande diagonale noire. */
const endOf = (sym: string) =>
  wrap(
    `<circle cx="50" cy="50" r="44" fill="#fff" stroke="#555" stroke-width="2"/>${sym}<g stroke="${INK}" stroke-width="3"><line x1="18" y1="78" x2="78" y2="18"/><line x1="24" y1="84" x2="84" y2="24"/><line x1="30" y1="88" x2="88" y2="30"/></g>`,
  )
const redBar = `<line x1="23" y1="23" x2="77" y2="77" stroke="${RED}" stroke-width="9"/>`

// ---------- Pictogrammes ----------
const pedestrian = (c: string, dx = 0, dy = 0, s = 1) =>
  `<g transform="translate(${dx} ${dy}) scale(${s})" stroke="${c}" fill="none" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="52" cy="40" r="4" fill="${c}" stroke="none"/><path d="M51 47 L48 62 L42 76 M48 62 L56 76 M50 51 L58 58 M50 51 L42 58"/></g>`
const bicycle = (c: string, dx = 0, dy = 0) =>
  `<g transform="translate(${dx} ${dy})" stroke="${c}" fill="none" stroke-width="3.5" stroke-linejoin="round"><circle cx="35" cy="62" r="10"/><circle cx="65" cy="62" r="10"/><path d="M35 62 L45 46 H60 L65 62 M45 46 L52 62 H35 M60 46 L57 38 M41 41 H49"/></g>`
const carBack = (cx: number, c: string) =>
  `<g fill="${c}"><path d="M${cx - 11} 52 L${cx - 8} 41 H${cx + 8} L${cx + 11} 52 Z"/><rect x="${cx - 13}" y="51" width="26" height="12" rx="3"/><rect x="${cx - 12}" y="62" width="6" height="7"/><rect x="${cx + 6}" y="62" width="6" height="7"/></g><rect x="${cx - 6}" y="44" width="12" height="5" fill="#fff"/>`
const truck = (c: string) =>
  `<g fill="${c}"><rect x="24" y="36" width="34" height="24"/><path d="M58 43 H69 L76 52 V60 H58 Z"/><circle cx="33" cy="63" r="5.5"/><circle cx="67" cy="63" r="5.5"/></g><rect x="61" y="46" width="7" height="6" fill="#fff"/>`
const arrowUp = (c: string) => `<path d="M50 82 V40" stroke="${c}" stroke-width="10"/><polygon points="34,44 50,20 66,44" fill="${c}"/>`
const speedText = (n: number, c: string) => `<text x="50" y="${n >= 100 ? 61 : 63}" font-size="${n >= 100 ? 30 : 38}" fill="${c}" ${FONT}>${n}</text>`

// ---------- Panneaux ----------
export const SIGNS = {
  // Danger
  virageDroite: danger(`<path d="M44 80 V64 Q44 54 54 54 H58" fill="none" stroke="${INK}" stroke-width="6"/><polygon points="57,46 68,54 57,62" fill="${INK}"/>`),
  virageGauche: danger(`<g transform="matrix(-1 0 0 1 100 0)"><path d="M44 80 V64 Q44 54 54 54 H58" fill="none" stroke="${INK}" stroke-width="6"/><polygon points="57,46 68,54 57,62" fill="${INK}"/></g>`),
  succession: danger(`<path d="M46 82 C46 72 57 70 57 63 C57 56 44 57 44 50 L44 48" fill="none" stroke="${INK}" stroke-width="6"/><polygon points="37,50 44,39 51,50" fill="${INK}"/>`),
  ralentisseur: danger(`<path d="M24 78 H38 Q50 56 62 78 H76" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`),
  retrecie: danger(`<path d="M37 82 L45 64 V42 M63 82 L55 64 V42" fill="none" stroke="${INK}" stroke-width="5"/>`),
  glissante: danger(`${carBack(50, INK)}<path d="M40 82 q5 -5 0 -9 q-5 -4 0 -8 M60 82 q5 -5 0 -9 q-5 -4 0 -8" fill="none" stroke="${INK}" stroke-width="3"/>`),
  enfants: danger(`${pedestrian(INK, 0, 12, 0.85)}${pedestrian(INK, 25, 25, 0.7)}`),
  pietons: danger(`${pedestrian(INK, -2, 6)}`),
  autresDangers: danger(`<rect x="45.5" y="38" width="9" height="30" rx="3" fill="${INK}"/><circle cx="50" cy="77" r="5" fill="${INK}"/>`),
  animauxSauvages: danger(
    `<g fill="${INK}"><ellipse cx="47" cy="62" rx="15" ry="6.5"/><path d="M57 58 L64 47 H71 L67 54 L61 62 Z"/></g><g stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none"><path d="M37 65 L33 78 M43 66 V79 M54 66 L57 79 M59 64 L64 76"/><path d="M66 47 L62 39 L59 37 M66 47 L70 39 L73 36"/></g>`,
  ),
  descente: danger(`<polygon points="28,80 72,80 72,56" fill="${INK}"/><text x="43" y="64" font-size="14" fill="${INK}" ${FONT}>10%</text>`),
  doubleSens: danger(`<path d="M41 82 V50" stroke="${INK}" stroke-width="6"/><polygon points="34,53 41,41 48,53" fill="${INK}"/><path d="M59 42 V72" stroke="${INK}" stroke-width="6"/><polygon points="52,70 59,82 66,70" fill="${INK}"/>`),
  chutePierres: danger(`<polygon points="28,82 28,42 37,42 50,82" fill="${INK}"/><g fill="${INK}"><circle cx="55" cy="58" r="4"/><circle cx="62" cy="69" r="3.5"/><circle cx="56" cy="77" r="3"/></g>`),
  cyclistes: danger(`${bicycle(INK, 0, 12).replace('stroke-width="3.5"', 'stroke-width="3"').replace(/r="10"/g, 'r="8"')}`),
  feux: danger(`<rect x="40" y="36" width="20" height="46" rx="4" fill="${INK}"/><circle cx="50" cy="45" r="5" fill="${RED}"/><circle cx="50" cy="59" r="5" fill="#f39c12"/><circle cx="50" cy="73" r="5" fill="#2e9e4a"/>`),
  passageNiveauBarrieres: danger(
    `<g fill="${INK}"><rect x="30" y="50" width="5" height="32"/><rect x="65" y="50" width="5" height="32"/></g><rect x="27" y="56" width="46" height="12" fill="#fff" stroke="${INK}" stroke-width="3"/><g stroke="${INK}" stroke-width="4"><line x1="38" y1="56" x2="34" y2="68"/><line x1="50" y1="56" x2="46" y2="68"/><line x1="62" y1="56" x2="58" y2="68"/></g>`,
  ),
  passageNiveauSans: danger(
    `<g fill="${INK}"><rect x="30" y="56" width="28" height="14"/><rect x="52" y="46" width="14" height="24"/><rect x="34" y="47" width="6" height="9"/><circle cx="37" cy="74" r="4.5"/><circle cx="48" cy="74" r="4.5"/><circle cx="61" cy="74" r="4.5"/></g>`,
  ),
  croixSaintAndre: wrap(
    `<g transform="rotate(45 50 50)"><rect x="43" y="2" width="14" height="96" fill="${RED}"/><rect x="2" y="43" width="96" height="14" fill="${RED}"/><rect x="46" y="5" width="8" height="90" fill="#fff"/><rect x="5" y="46" width="90" height="8" fill="#fff"/></g>`,
  ),
  travaux: danger(
    `<circle cx="44" cy="45" r="4.5" fill="${INK}"/><path d="M43 51 L47 64 L41 78 M47 64 L55 77 M45 55 L56 60 L63 73" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><polygon points="58,82 74,82 68,72" fill="${INK}"/>`,
    YELLOW,
  ),

  // Intersections et priorités
  prioriteDroite: danger(`<path d="M38 48 L62 80 M62 48 L38 80" stroke="${INK}" stroke-width="7"/>`),
  prioritePonctuelle: danger(`<rect x="45" y="38" width="10" height="44" fill="${INK}"/><rect x="31" y="58" width="38" height="5" fill="${INK}"/>`),
  giratoire: danger(
    `<g fill="none" stroke="${INK}" stroke-width="5"><path d="M50 76 A12 12 0 0 0 61.8 66.1"/><path d="M39.6 58 A12 12 0 0 0 42.3 73.2"/><path d="M60.4 58 A12 12 0 0 0 45.9 52.7"/></g><g fill="${INK}"><polygon points="62.7,61.2 65.8,66.8 57.9,65.4"/><polygon points="46.1,76.4 39.7,76.3 44.9,70.1"/><polygon points="41.2,54.4 44.5,49 47.3,56.5"/></g>`,
  ),
  cedezPassage: wrap(`<polygon points="6,12 94,12 50,90" fill="#fff" stroke="${RED}" stroke-width="8" stroke-linejoin="round"/>`),
  stop: wrap(
    `<polygon points="92.5,32.4 67.6,7.5 32.4,7.5 7.5,32.4 7.5,67.6 32.4,92.5 67.6,92.5 92.5,67.6" fill="#fff"/><polygon points="88.8,33.9 66.1,11.2 33.9,11.2 11.2,33.9 11.2,66.1 33.9,88.8 66.1,88.8 88.8,66.1" fill="${RED}"/><text x="50" y="59" font-size="25" fill="#fff" ${FONT}>STOP</text>`,
  ),
  routePrioritaire: wrap(
    `<rect x="18" y="18" width="64" height="64" fill="#fff" stroke="#999" stroke-width="2" transform="rotate(45 50 50)"/><rect x="29" y="29" width="42" height="42" fill="${YELLOW}" transform="rotate(45 50 50)"/>`,
  ),
  finRoutePrioritaire: wrap(
    `<rect x="18" y="18" width="64" height="64" fill="#fff" stroke="#999" stroke-width="2" transform="rotate(45 50 50)"/><rect x="29" y="29" width="42" height="42" fill="${YELLOW}" transform="rotate(45 50 50)"/><g stroke="${INK}" stroke-width="3"><line x1="26" y1="66" x2="66" y2="26"/><line x1="30" y1="70" x2="70" y2="30"/><line x1="34" y1="74" x2="74" y2="34"/></g>`,
  ),

  // Interdiction
  circulationInterdite: prohibition(''),
  sensInterdit: wrap(`<circle cx="50" cy="50" r="46" fill="${RED}" stroke="#fff" stroke-width="3"/><rect x="18" y="41" width="64" height="18" fill="#fff"/>`),
  tournerGaucheInterdit: prohibition(
    `<path d="M58 78 V56 Q58 44 46 44 H40" fill="none" stroke="${INK}" stroke-width="7"/><polygon points="42,35 29,44 42,53" fill="${INK}"/>${redBar}`,
  ),
  demiTourInterdit: prohibition(
    `<path d="M60 78 V46 Q60 33 50 33 Q40 33 40 46 V56" fill="none" stroke="${INK}" stroke-width="7"/><polygon points="32,54 40,68 48,54" fill="${INK}"/>${redBar}`,
  ),
  depassementInterdit: prohibition(`${carBack(36, RED)}${carBack(64, INK)}`),
  finDepassementInterdit: endOf(`${carBack(36, GREY)}${carBack(64, GREY)}`),
  stationnementInterdit: wrap(
    `<circle cx="50" cy="50" r="43" fill="${BLUE}" stroke="${RED}" stroke-width="10"/><line x1="23" y1="23" x2="77" y2="77" stroke="${RED}" stroke-width="9"/>`,
  ),
  arretStationnementInterdits: wrap(
    `<circle cx="50" cy="50" r="43" fill="${BLUE}" stroke="${RED}" stroke-width="10"/><line x1="23" y1="23" x2="77" y2="77" stroke="${RED}" stroke-width="9"/><line x1="77" y1="23" x2="23" y2="77" stroke="${RED}" stroke-width="9"/>`,
  ),
  poidsLourdsInterdits: prohibition(truck(INK)),
  pietonsInterdits: prohibition(pedestrian(INK, -2, 2)),
  cyclesInterdits: prohibition(bicycle(INK, 0, -4)),
  hauteurLimitee: prohibition(
    `<polygon points="42,20 58,20 50,30" fill="${INK}"/><polygon points="42,80 58,80 50,70" fill="${INK}"/><text x="50" y="57" font-size="17" fill="${INK}" ${FONT}>3,5 m</text>`,
  ),
  vitesse30: prohibition(speedText(30, INK)),
  vitesse50: prohibition(speedText(50, INK)),
  vitesse70: prohibition(speedText(70, INK)),
  vitesse80: prohibition(speedText(80, INK)),
  vitesse110: prohibition(speedText(110, INK)),
  finVitesse70: endOf(speedText(70, GREY)),
  finInterdictions: endOf(''),

  // Obligation
  toutDroit: obligation(arrowUp('#fff')),
  contournementDroite: obligation(`<g transform="rotate(-45 50 50)"><path d="M50 18 V58" stroke="#fff" stroke-width="10"/><polygon points="34,54 50,78 66,54" fill="#fff"/></g>`),
  toutDroitOuDroite: obligation(
    `<path d="M44 84 V32 M44 56 Q44 47 54 47 H62" fill="none" stroke="#fff" stroke-width="8"/><polygon points="32,34 44,17 56,34" fill="#fff"/><polygon points="60,37 75,47 60,57" fill="#fff"/>`,
  ),
  pisteCyclable: obligation(bicycle('#fff', 0, -4)),
  cheminPietons: obligation(pedestrian('#fff', -2, 2)),
  vitesseMinimale: obligation(speedText(30, '#fff')),
  finPisteCyclable: obligation(`${bicycle('#fff', 0, -4)}<line x1="80" y1="20" x2="20" y2="80" stroke="${RED}" stroke-width="7"/>`),

  // Indication
  parking: square(`<text x="50" y="74" font-size="66" fill="#fff" ${FONT}>P</text>`),
  sensUnique: square(arrowUp('#fff')),
  impasse: square(`<rect x="44" y="36" width="12" height="50" fill="#fff"/><rect x="24" y="20" width="52" height="15" fill="${RED}"/>`),
  passagePietonsIndication: square(
    `<polygon points="50,12 89,84 11,84" fill="#fff"/>${pedestrian(INK, -2, 6, 0.9)}<g fill="${INK}"><rect x="28" y="78" width="7" height="3"/><rect x="40" y="78" width="7" height="3"/><rect x="52" y="78" width="7" height="3"/><rect x="64" y="78" width="7" height="3"/></g>`,
  ),
  autoroute: square(
    `<path d="M28 88 L44 40 M72 88 L56 40" stroke="#fff" stroke-width="5"/><path d="M50 86 V76 M50 68 V60 M50 53 V46" stroke="#fff" stroke-width="3"/><rect x="16" y="26" width="68" height="9" fill="#fff"/><rect x="22" y="35" width="5" height="12" fill="#fff"/><rect x="73" y="35" width="5" height="12" fill="#fff"/>`,
  ),
  finAutoroute: square(
    `<path d="M28 88 L44 40 M72 88 L56 40" stroke="#fff" stroke-width="5"/><path d="M50 86 V76 M50 68 V60 M50 53 V46" stroke="#fff" stroke-width="3"/><rect x="16" y="26" width="68" height="9" fill="#fff"/><rect x="22" y="35" width="5" height="12" fill="#fff"/><rect x="73" y="35" width="5" height="12" fill="#fff"/><line x1="14" y1="86" x2="86" y2="14" stroke="${RED}" stroke-width="7"/>`,
  ),
  entreeAgglo: wrap(`<rect x="5" y="14" width="156" height="72" rx="6" fill="#fff" stroke="${RED}" stroke-width="7"/><text x="83" y="59" font-size="22" fill="${INK}" ${FONT}>VILLENEUVE</text>`, true),
  sortieAgglo: wrap(
    `<rect x="5" y="14" width="156" height="72" rx="6" fill="#fff" stroke="${RED}" stroke-width="7"/><text x="83" y="59" font-size="22" fill="${INK}" ${FONT}>VILLENEUVE</text><line x1="22" y1="80" x2="144" y2="20" stroke="${RED}" stroke-width="6"/>`,
    true,
  ),
  zone30: wrap(
    `<rect x="4" y="6" width="158" height="88" rx="6" fill="#fff" stroke="#555" stroke-width="2"/><text x="46" y="58" font-size="24" fill="${INK}" ${FONT}>ZONE</text><circle cx="118" cy="50" r="31" fill="#fff" stroke="${RED}" stroke-width="7"/><text x="118" y="61" font-size="30" fill="${INK}" ${FONT}>30</text>`,
    true,
  ),
} as const

export type SignName = keyof typeof SIGNS

/** Recto d'une carte « panneau » : le dessin puis la question. */
export const signCard = (name: SignName, question = 'Que signifie ce panneau ?') => `${SIGNS[name]}\n\n${question}`
