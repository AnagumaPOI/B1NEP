// Action-definition dictionary for the block builder.
//
//   For each RIDO command supported by the visual builder, this maps
//   the action type to:
//     - a human-readable label (shown in tooltips/labels), and
//     - an ordered list of parameter descriptors `{key, label, default,
//       step, width}` that the renderer turns into <input> fields.
//
//   The string `'__newrow__'` inserted into the params list is a
//   row-break marker: the action's <input>s wrap onto a new row inside
//   the same action block.  This is what gives BAC / SOI / BUT / ANC
//   their two-line layouts.
//
// Exposed as window.ACTION_DEFS so the inline builder script can pick
// it up directly.
window.ACTION_DEFS = {
  // type -> { label, params: [{key, label, default, step, width}] }
  CAL: { label: 'CAL (compute)', params: [
    { key: 'paren', label: 'mode', default: '0' }, // free string e.g. "0", "1", "2,1"
  ]},
  ENV: { label: 'ENV (envelope = CAL(2,1))', params: [] },
  EXC: { label: 'EXC (excavate)', params: [
    { key: 'side', label: 'side', default: 2, step: 1 },
    { key: 'Z1',   label: 'depth', default: 1.7, step: 0.1 },
  ]},
  WAT: { label: 'WAT (water profile / cap, = EAU)', params: [
    { key: 'side', label: 'side', default: 2, step: 1 },
    { key: 'Z1',   label: 'z',    default: 2.7, step: 0.1 },
    { key: 'U',    label: 'u_w',  default: 0.0, step: 0.1 },
  ]},
  SUC: { label: 'SUC (uniform surcharge)', params: [
    { key: 'side', label: 'side', default: 1, step: 1 },
    { key: 'Q',    label: 'Q',    default: 1.5, step: 0.1 },
  ]},
  SUB: { label: 'SUB (Boussinesq strip)', params: [
    { key: 'side', label: 'side', default: 1, step: 1 },
    { key: 'Z1',   label: 'z0',   default: 0.0, step: 0.1 },
    { key: 'A',    label: 'A',    default: 0.0, step: 0.1 },
    { key: 'B',    label: 'B',    default: 5.0, step: 0.1 },
    { key: 'Q',    label: 'Q',    default: 2.0, step: 0.1 },
  ]},
  BUT: { label: 'BUT (strut install, = STR)', params: [
    // row 1: identifier, geometry, inclination, preload
    { key: 'index',  label: 'k',    default: 1, step: 1 },
    { key: 'Z',      label: 'z',    default: 1.0, step: 0.1 },
    { key: 'S',      label: 'S',    default: 5.0, step: 0.1 },
    { key: 'I',      label: 'incl', default: 0.0, step: 1 },
    { key: 'F',      label: 'pre',  default: -30.0, step: 1 },
    '__newrow__',
    // row 2: strut type preset + k_s
    { key: 'kstrut', label: 'k_s',  default: 4058, step: 100 },
  ]},
  ANC: { label: 'ANC (anchor install, = TIR)', params: [
    // row 1: identifier, geometry, inclination, preload
    { key: 'index',  label: 'k',    default: 1, step: 1 },
    { key: 'Z',      label: 'z',    default: 1.0, step: 0.1 },
    { key: 'S',      label: 'S',    default: 5.0, step: 0.1 },
    { key: 'I',      label: 'incl', default: 30.0, step: 1 },
    { key: 'F',      label: 'pre',  default: -30.0, step: 1 },
    '__newrow__',
    // row 2: strut type preset + k_s
    { key: 'kstrut', label: 'k_s',  default: 4058, step: 100 },
  ]},
  BUT_REMOVE: { label: '-BUT (remove strut/anchor)', params: [
    { key: 'sub_index', label: 'id', default: 1, step: 1 },
  ]},
  BAC: { label: 'BAC (backfill / soil change, = REM)', params: [
    // row 1: side, depths, cohesion + φ + γ
    { key: 'side', label: 'side', default: 2, step: 1 },
    { key: 'Z1',   label: 'z_top', default: 1.0, step: 0.1 },
    { key: 'Z2',   label: 'z_bot', default: 3.0, step: 0.1 },
    { key: 'c',    label: 'c',     default: 0.0,  step: 0.1 },
    { key: 'phi',  label: 'φ',     default: 30.0, step: 0.5 },
    { key: 'UW',   label: 'γ',     default: 1.9,  step: 0.01 },
    '__newrow__',
    // row 2: lateral-earth-pressure coefficients + kh
    { key: 'Ka',   label: 'Ka',    default: 0.31, step: 0.01 },
    { key: 'K0',   label: 'K0',    default: 0.47, step: 0.01 },
    { key: 'Kp',   label: 'Kp',    default: 5.47, step: 0.01 },
    { key: 'kh',   label: 'kh',    default: 500,  step: 50 },
  ]},
  LOA: { label: 'LOA (trapezoidal wall load, = CHA)', params: [
    { key: 'side', label: 'side', default: 1, step: 1 },
    { key: 'Z1',   label: 'z1',   default: 0.0, step: 0.1 },
    { key: 'Z2',   label: 'z2',   default: 5.0, step: 0.1 },
    { key: 'Q1',   label: 'q1',   default: 1.0, step: 0.1 },
    { key: 'Q2',   label: 'q2',   default: 1.0, step: 0.1 },
  ]},
  CFM: { label: 'CFM (point force / moment)', params: [
    { key: 'Z',       label: 'z',    default: 1.0, step: 0.1 },
    { key: 'F',       label: 'F',    default: 0.0, step: 0.1 },
    { key: 'M',       label: 'C',    default: 0.0, step: 0.1 },
  ]},
  CFM_LINK: { label: 'CFM(n) (elastic connection)', params: [
    { key: 'support_id', label: 'id',   default: 1, step: 1 },
    { key: 'F',          label: 'F',   default: 0.0, step: 0.1 },
    { key: 'M',          label: 'C',   default: 0.0, step: 0.1 },
    '__newrow__',
    { key: 'CFY',        label: 'CFY', default: 0.0, step: 100 },
    { key: 'CFA',        label: 'CFA', default: 0.0, step: 100 },
    { key: 'CMY',        label: 'CMY', default: 0.0, step: 100 },
    { key: 'CMA',        label: 'CMA', default: 0.0, step: 100 },
  ]},
  SOI: { label: 'SOI (in-place soil change, = SOL)', params: [
    // row 1: side, depths, cohesion + φ + γ
    { key: 'side', label: 'side', default: 2, step: 1 },
    { key: 'Z1',   label: 'z_top', default: 1.0, step: 0.1 },
    { key: 'Z2',   label: 'z_bot', default: 3.0, step: 0.1 },
    { key: 'c',    label: 'c',     default: 0.0,  step: 0.1 },
    { key: 'phi',  label: 'φ',     default: 30.0, step: 0.5 },
    { key: 'UW',   label: 'γ',     default: 1.9,  step: 0.01 },
    '__newrow__',
    // row 2: lateral-earth-pressure coefficients + kh
    { key: 'Ka',   label: 'Ka',    default: 0.31, step: 0.01 },
    { key: 'K0',   label: 'K0',    default: 0.47, step: 0.01 },
    { key: 'Kp',   label: 'Kp',    default: 5.47, step: 0.01 },
    { key: 'kh',   label: 'kh',    default: 500,  step: 50 },
  ]},
};
