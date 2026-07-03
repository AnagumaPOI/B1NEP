(function () {
  const H_SECTIONS = {
    'H 250x250x9x14': { hw_cm: 25.0, tw_cm: 0.9, As_cm2: 92.18, Zx_cm3: 867.0, rx_cm: 10.8, ry_cm: 6.29, Ix_cm4: 10800.0, w_t_m: 0.0724, Iy_cm4: 3650.0, rido_capacity_t: 16.2, wale_capacity_t: 59.4 },
    'H 300x300x10x15': { hw_cm: 30.0, tw_cm: 1.0, As_cm2: 119.8, Zx_cm3: 1360.0, rx_cm: 13.1, ry_cm: 7.51, Ix_cm4: 20400.0, w_t_m: 0.094, Iy_cm4: 6750.0, rido_capacity_t: 54.0, wale_capacity_t: 75.6 },
    'H 350x350x12x19': { hw_cm: 35.0, tw_cm: 1.2, As_cm2: 173.9, Zx_cm3: 2300.0, rx_cm: 15.2230870942, ry_cm: 8.84, Ix_cm4: 40300.0, w_t_m: 0.136, Iy_cm4: 13600.0, rido_capacity_t: 118.8, wale_capacity_t: 102.6 },
    'H 400x400x13x21': { hw_cm: 40.0, tw_cm: 1.3, As_cm2: 218.7, Zx_cm3: 3330.0, rx_cm: 17.4506947991, ry_cm: 10.1, Ix_cm4: 66600.0, w_t_m: 0.172, Iy_cm4: 22400.0, rido_capacity_t: 183.6, wale_capacity_t: 129.6 },
    '2H 350x350x12x19': { hw_cm: 70.0, tw_cm: 1.2, As_cm2: 347.8, Zx_cm3: 4600.0, rx_cm: 15.2230870942, ry_cm: 8.84, Ix_cm4: 80600.0, w_t_m: 0.272, Iy_cm4: 27200.0, rido_capacity_t: 256.5, wale_capacity_t: 202.5 },
    '2H 350x357x19x19': { hw_cm: 70.0, tw_cm: 1.9, As_cm2: 396.8, Zx_cm3: 4900.0, rx_cm: 14.7, ry_cm: 8.53, Ix_cm4: 85600.0, w_t_m: 0.312, Iy_cm4: 28800.0, rido_capacity_t: 297.0, wale_capacity_t: 324.0 },
    'H 428x407x20x35': { hw_cm: 42.8, tw_cm: 2.0, As_cm2: 360.7, Zx_cm3: 5570.0, rx_cm: 18.2, ry_cm: 10.4, Ix_cm4: 119000.0, w_t_m: 0.283, Iy_cm4: 39400.0, rido_capacity_t: 334.8, wale_capacity_t: 210.6 },
    '2H 400x400x13x21': { hw_cm: 80.0, tw_cm: 1.3, As_cm2: 437.4, Zx_cm3: 6660.0, rx_cm: 17.4506947991, ry_cm: 10.12, Ix_cm4: 133200.0, w_t_m: 0.344, Iy_cm4: 44800.0, rido_capacity_t: 378.0, wale_capacity_t: 256.5 },
    '2H 428x407x20x35': { hw_cm: 85.6, tw_cm: 2.0, As_cm2: 721.4, Zx_cm3: 11140.0, rx_cm: 18.2, ry_cm: 10.4, Ix_cm4: 238000.0, w_t_m: 0.566, Iy_cm4: 78800.0, rido_capacity_t: 688.5, wale_capacity_t: 418.5 },
    '2H 500x500x25x25': { hw_cm: 100.0, tw_cm: 2.5, As_cm2: 736.6, Zx_cm3: 13040.0, rx_cm: 21.0, ry_cm: 11.9, Ix_cm4: 326000.0, w_t_m: 0.578, Iy_cm4: 104400.0, rido_capacity_t: 756.0, wale_capacity_t: 607.5 },
    '2H 458x417x30x50': { hw_cm: 91.6, tw_cm: 3.0, As_cm2: 1057.2, Zx_cm3: 16340.0, rx_cm: 18.8, ry_cm: 10.7, Ix_cm4: 374000.0, w_t_m: 0.83, Iy_cm4: 121000.0, rido_capacity_t: 1039.5, wale_capacity_t: 661.5 },
  };

  const STRUT_TYPES = [
    { name: 'Custom', As: null },
    ...Object.entries(H_SECTIONS).map(([name, sec]) => ({ name, As: sec.As_cm2 })),
  ];

  const STRUT_E_TFM2 = 2.1e7;
  const STRUT_ALPHA = 0.5;

  function kFromStrutType(typeName, L_m, reduction = STRUT_ALPHA, angleDeg = 0) {
    const t = STRUT_TYPES.find(s => s.name === typeName);
    if (!t || t.As == null || !(L_m > 0)) return null;
    const rs = Number.isFinite(Number(reduction)) ? Number(reduction) : STRUT_ALPHA;
    const theta = Number.isFinite(Number(angleDeg)) ? Number(angleDeg) * Math.PI / 180 : 0;
    const cos2 = Math.pow(Math.cos(theta), 2);
    const A_m2 = t.As / 1e4;
    return Math.round(rs * STRUT_E_TFM2 * A_m2 / L_m * cos2);
  }

  window.H_SECTIONS = H_SECTIONS;
  window.STRUT_TYPES = STRUT_TYPES;
  window.STRUT_E_TFM2 = STRUT_E_TFM2;
  window.STRUT_ALPHA = STRUT_ALPHA;
  window.kFromStrutType = kFromStrutType;
})();
