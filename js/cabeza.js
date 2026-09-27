// La cabeza del modelo provisorio del Laberinto 3D, como superficie implícita.
//
// En vez de pegar esferas, la cabeza es una función de distancia con signo
// (SDF): cráneo, cara, mandíbula, mentón, pómulos, nariz, cejas, labios y
// orejas son elipsoides y cápsulas fundidos con uniones suaves, y las cuencas
// de los ojos y la boca se tallan restando. La malla sale de muestrear esa
// función en una grilla y extraer la superficie con «surface nets», que da una
// sola piel continua sin costuras entre las partes.
//
// Sin three.js ni DOM: devuelve arreglos planos. laberinto.js los mete en una
// BufferGeometry, y los tests revisan medidas y orientación.
//
// Marco de la cabeza de canales.js, en metros: +x izquierda del paciente,
// +y arriba, +z hacia la nariz; el origen, entre los dos oídos.

/** Paso de la grilla, en metros. Más fino es más lindo y más lento. */
export const PASO = 0.0024;

/** Límites de la grilla: la cabeza entra con margen. */
const MIN = [-0.1, -0.125, -0.12];
const MAX = [0.1, 0.15, 0.14];

/** Centro de rotación de cada ojo; laberinto.js pone los globos ahí. */
export const OJO = { x: 0.032, y: 0.022, z: 0.078, radio: 0.012 };

// Distancias aproximadas (Quílez): el elipsoide no tiene fórmula cerrada, pero
// esta es buena cerca de la superficie, que es donde importa.
function elipsoide(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = px - cx;
  const y = py - cy;
  const z = pz - cz;
  // Math.sqrt y no Math.hypot: esto corre un millón de veces por cabeza, y
  // hypot es varias veces más lento.
  const ux = x / rx;
  const uy = y / ry;
  const uz = z / rz;
  const k0 = Math.sqrt(ux * ux + uy * uy + uz * uz);
  const k1 = Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry) + (uz * uz) / (rz * rz));
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}

function capsula(px, py, pz, ax, ay, az, bx, by, bz, r) {
  const pax = px - ax;
  const pay = py - ay;
  const paz = pz - az;
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  const dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/** Unión suave: funde las dos formas en un radio `k`. */
function une(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Resta suave: saca `b` de `a`, redondeando el borde en `k`. */
function resta(a, b, k) {
  return -une(-a, b, k);
}

/**
 * Cota inferior de la distancia a lo que entra en la esfera (c, R). Sirve para
 * saltear piezas: una unión suave con `b` no cambia nada si b ≥ d + k.
 */
function lejos(x, y, z, cx, cy, cz, R) {
  const dx = x - cx;
  const dy = y - cy;
  const dz = z - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - R;
}

/**
 * Distancia con signo a la piel: negativa adentro. Simétrica en x, así que
 * cada par (orejas, pómulos, cuencas) se escribe una vez con |x|. Cada pieza
 * chica va detrás de su esfera envolvente: lejos de ella no se calcula.
 */
export function distancia(x, y, z) {
  const ax = Math.abs(x);
  // Cráneo, la masa de la cara y la mandíbula: siempre.
  let d = elipsoide(x, y, z, 0, 0.04, -0.006, 0.074, 0.093, 0.098);
  d = une(d, elipsoide(x, y, z, 0, 0.008, 0.036, 0.066, 0.083, 0.07), 0.02);
  d = une(d, elipsoide(x, y, z, 0, -0.06, 0.036, 0.052, 0.042, 0.058), 0.018);
  // Ángulos de la mandíbula y mentón.
  if (lejos(ax, y, z, 0.046, -0.052, 0.004, 0.03) < d + 0.016) {
    d = une(d, elipsoide(ax, y, z, 0.046, -0.052, 0.004, 0.016, 0.03, 0.026), 0.016);
  }
  if (lejos(x, y, z, 0, -0.085, 0.066, 0.021) < d + 0.018) {
    d = une(d, elipsoide(x, y, z, 0, -0.085, 0.066, 0.021, 0.017, 0.019), 0.018);
  }
  // Pómulos.
  if (lejos(ax, y, z, 0.046, -0.004, 0.062, 0.026) < d + 0.012) {
    d = une(d, elipsoide(ax, y, z, 0.046, -0.004, 0.062, 0.022, 0.016, 0.026), 0.012);
  }
  // Arco de las cejas: apenas, fundido en la frente.
  if (lejos(ax, y, z, 0.021, 0.041, 0.088, 0.03) < d + 0.016) {
    d = une(d, capsula(ax, y, z, 0, 0.041, 0.092, 0.04, 0.041, 0.082, 0.0068), 0.016);
  }
  // Nariz: dorso, punta y alas, finos y fundidos para que no sea una pieza
  // pegada.
  if (lejos(x, y, z, 0, -0.002, 0.104, 0.036) < d + 0.01) {
    d = une(d, capsula(x, y, z, 0, 0.024, 0.093, 0, -0.015, 0.112, 0.0062), 0.01);
    d = une(d, elipsoide(x, y, z, 0, -0.018, 0.109, 0.0086, 0.0082, 0.0095), 0.008);
    d = une(d, elipsoide(ax, y, z, 0.0102, -0.023, 0.1015, 0.0062, 0.0055, 0.0072), 0.007);
  }
  // Labios, y la línea de la boca tallada entre los dos. Sobresalen unos
  // milímetros de la cara y se funden en ella: con poca fusión eran dos
  // barras.
  if (lejos(x, y, z, 0, -0.045, 0.092, 0.034) < Math.abs(d) + 0.014) {
    // El maxilar bajo la nariz, que lleva la boca un poco adelante: sin él,
    // entre la nariz y el labio quedaba un hueco.
    d = une(d, elipsoide(x, y, z, 0, -0.036, 0.089, 0.019, 0.014, 0.011), 0.014);
    d = une(d, elipsoide(x, y, z, 0, -0.047, 0.0955, 0.0165, 0.0045, 0.0062), 0.01);
    d = une(d, elipsoide(x, y, z, 0, -0.0565, 0.0935, 0.0145, 0.005, 0.0062), 0.01);
    d = resta(d, elipsoide(x, y, z, 0, -0.0515, 0.1015, 0.016, 0.0009, 0.007), 0.002);
  }
  // Orejas: el pabellón pegado al cráneo, con la concha tallada.
  if (lejos(ax, y, z, 0.077, 0.002, -0.01, 0.031) < d + 0.005) {
    let oreja = elipsoide(ax, y, z, 0.077, 0.002, -0.01, 0.0085, 0.03, 0.019);
    oreja = resta(oreja, elipsoide(ax, y, z, 0.0835, 0.003, -0.008, 0.0035, 0.021, 0.012), 0.003);
    d = une(d, oreja, 0.005);
  }
  // Los ojos: la piel los tapa y solo se abre la hendidura de los párpados,
  // una almendra por donde asoma el iris. Una resta cambia algo solo si lo
  // que se resta está a menos de −d + k.
  if (lejos(ax, y, z, OJO.x, OJO.y, OJO.z + 0.013, 0.016) < -d + 0.004) {
    d = resta(d, elipsoide(ax, y, z, OJO.x + 0.001, OJO.y + 0.0005, OJO.z + 0.013, 0.0135, 0.006, 0.009), 0.004);
  }
  return d;
}

/**
 * La malla de la piel: posiciones, normales (x, y, z seguidos) e índices de
 * triángulos con la cara exterior en sentido antihorario.
 */
export function mallaCabeza(paso = PASO) {
  const n = [0, 1, 2].map((i) => Math.ceil((MAX[i] - MIN[i]) / paso) + 1);
  const [nx, ny, nz] = n;
  const f = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => i + nx * (j + ny * k);

  // De grueso a fino: primero una grilla G veces más espaciada, y en la fina
  // solo se evalúa de verdad cerca de la piel. Lejos alcanza con el signo, que
  // la interpolación de la gruesa ya da bien: la superficie solo usa valores
  // donde hay cambio de signo. Es unas cinco veces más rápido.
  const G = 3;
  const ng = n.map((v) => Math.ceil((v - 1) / G) + 2);
  const g = new Float32Array(ng[0] * ng[1] * ng[2]);
  const gidx = (i, j, k) => i + ng[0] * (j + ng[1] * k);
  for (let k = 0; k < ng[2]; k++) {
    for (let j = 0; j < ng[1]; j++) {
      for (let i = 0; i < ng[0]; i++) {
        g[gidx(i, j, k)] = distancia(MIN[0] + i * G * paso, MIN[1] + j * G * paso, MIN[2] + k * G * paso);
      }
    }
  }
  const lejos = 1.5 * G * paso;
  for (let k = 0; k < nz; k++) {
    const z = MIN[2] + k * paso;
    const ck = Math.floor(k / G);
    const tk = k / G - ck;
    for (let j = 0; j < ny; j++) {
      const y = MIN[1] + j * paso;
      const cj = Math.floor(j / G);
      const tj = j / G - cj;
      for (let i = 0; i < nx; i++) {
        const ci = Math.floor(i / G);
        const ti = i / G - ci;
        const c00 = g[gidx(ci, cj, ck)] * (1 - ti) + g[gidx(ci + 1, cj, ck)] * ti;
        const c10 = g[gidx(ci, cj + 1, ck)] * (1 - ti) + g[gidx(ci + 1, cj + 1, ck)] * ti;
        const c01 = g[gidx(ci, cj, ck + 1)] * (1 - ti) + g[gidx(ci + 1, cj, ck + 1)] * ti;
        const c11 = g[gidx(ci, cj + 1, ck + 1)] * (1 - ti) + g[gidx(ci + 1, cj + 1, ck + 1)] * ti;
        const v = (c00 * (1 - tj) + c10 * tj) * (1 - tk) + (c01 * (1 - tj) + c11 * tj) * tk;
        f[idx(i, j, k)] = Math.abs(v) > lejos ? v : distancia(MIN[0] + i * paso, y, z);
      }
    }
  }

  // Un vértice por celda que la piel atraviesa: el promedio de los cruces
  // en las aristas de la celda.
  const vertice = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const celda = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  // Esquinas y aristas de una celda como desplazamientos planos en `f`, sin
  // arreglos por celda: este lazo recorre un millón de celdas.
  const EX = [0, 1, 0, 1, 0, 1, 0, 1];
  const EY = [0, 0, 1, 1, 0, 0, 1, 1];
  const EZ = [0, 0, 0, 0, 1, 1, 1, 1];
  const desp = EX.map((_, c) => EX[c] + nx * (EY[c] + ny * EZ[c]));
  const AR = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  const val = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const base = i + nx * (j + ny * k);
        let adentro = 0;
        for (let c = 0; c < 8; c++) {
          const v = f[base + desp[c]];
          val[c] = v;
          if (v < 0) adentro++;
        }
        if (adentro === 0 || adentro === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let m = 0;
        for (let e = 0; e < 24; e += 2) {
          const A = AR[e];
          const B = AR[e + 1];
          const va = val[A];
          const vb = val[B];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += EX[A] + t * (EX[B] - EX[A]);
          sy += EY[A] + t * (EY[B] - EY[A]);
          sz += EZ[A] + t * (EZ[B] - EZ[A]);
          m++;
        }
        vertice[celda(i, j, k)] = pos.length / 3;
        pos.push(MIN[0] + (i + sx / m) * paso, MIN[1] + (j + sy / m) * paso, MIN[2] + (k + sz / m) * paso);
      }
    }
  }

  // Un cuadrilátero por arista de la grilla que la piel corta, uniendo los
  // vértices de las cuatro celdas que la rodean.
  const tri = [];
  const quad = (a, b, c, d, afuera) => {
    if (afuera) tri.push(a, b, c, a, c, d);
    else tri.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const v0 = f[idx(i, j, k)] < 0;
        // Arista en x: celdas vecinas en j y k.
        if (i < nx - 1 && v0 !== f[idx(i + 1, j, k)] < 0) {
          quad(
            vertice[celda(i, j - 1, k - 1)],
            vertice[celda(i, j, k - 1)],
            vertice[celda(i, j, k)],
            vertice[celda(i, j - 1, k)],
            v0,
          );
        }
        if (j < ny - 1 && v0 !== f[idx(i, j + 1, k)] < 0) {
          quad(
            vertice[celda(i - 1, j, k - 1)],
            vertice[celda(i - 1, j, k)],
            vertice[celda(i, j, k)],
            vertice[celda(i, j, k - 1)],
            v0,
          );
        }
        if (k < nz - 1 && v0 !== f[idx(i, j, k + 1)] < 0) {
          quad(
            vertice[celda(i - 1, j - 1, k)],
            vertice[celda(i, j - 1, k)],
            vertice[celda(i, j, k)],
            vertice[celda(i - 1, j, k)],
            v0,
          );
        }
      }
    }
  }

  // Normales: promedio de las de los triángulos de cada vértice, pesadas por
  // área. El gradiente de la distancia era más exacto pero costaba seis
  // evaluaciones por vértice, y en una piel translúcida no se nota.
  const nor = new Float32Array(pos.length);
  for (let t = 0; t < tri.length; t += 3) {
    const [a, b, c] = [3 * tri[t], 3 * tri[t + 1], 3 * tri[t + 2]];
    const ux = pos[b] - pos[a];
    const uy = pos[b + 1] - pos[a + 1];
    const uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a];
    const vy = pos[c + 1] - pos[a + 1];
    const vz = pos[c + 2] - pos[a + 2];
    const nx_ = uy * vz - uz * vy;
    const ny_ = uz * vx - ux * vz;
    const nz_ = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      nor[v] += nx_;
      nor[v + 1] += ny_;
      nor[v + 2] += nz_;
    }
  }
  for (let v = 0; v < nor.length; v += 3) {
    const l = Math.sqrt(nor[v] * nor[v] + nor[v + 1] * nor[v + 1] + nor[v + 2] * nor[v + 2]) || 1;
    nor[v] /= l;
    nor[v + 1] /= l;
    nor[v + 2] /= l;
  }
  return { posiciones: new Float32Array(pos), normales: nor, indices: new Uint32Array(tri) };
}
