// Paciente simulado: una patología vestibular puesta sobre pulsos REALES.
//
// Un compañero sano hace de paciente, el alumno le da impulsos de verdad —con
// su técnica, sus rebotes y sus manos en la cara— y el motor le agrega un
// déficit: la mirada se arrastra con la cabeza en la fracción que el reflejo
// no compensa, y sacadas correctivas la devuelven al blanco. El alumno tiene
// que examinar Y leer, que es lo que ni la cámara sola ni los casos
// sintéticos dan por separado.
//
// La simulación trabaja sobre el CRUDO, antes del motor: toma el azimut de
// mirada real de cada cuadro, le suma el arrastre y vuelve a convertirlo en
// corrimiento del iris con el mismo modelo (radio y k) con que el motor lo va
// a leer. Así el ruido, la técnica y los rechazos son los del examen real, y
// todo lo demás —ganancias, sacadas detectadas, perillas, Recalcular— corre
// igual que con un pulso medido.
//
// Sin DOM: app.js la usa en vivo y al cerrar cada pulso, y los tests la
// prueban sobre pulsos sintéticos sanos.

import { EYE_ROTATION_RADIUS_MM } from './geom.js';

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const suave = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Duración de una sacada correctiva: de 30 a 50 ms en la clínica. */
export const DURACION_SACADA_S = 0.03;

/**
 * Qué parte del giro de la cabeza cuenta como impulso: el reflejo que falla
 * es el de alta velocidad. Por debajo de ~50 °/s el seguimiento lento y el
 * propio VOR compensan igual, y la vuelta lenta al centro no arrastra la
 * mirada. Entre los dos umbrales se pasa de a poco.
 */
const V_DESDE = 50;
const V_HASTA = 100;

/**
 * Cuánto después del disparo termina un impulso típico, en s. Una sacada que
 * arranca antes es encubierta; después, manifiesta. Es lo que usa practica.js
 * para saber qué sacadas trae cada perfil, y el test comprueba que el detector
 * las clasifique igual.
 */
export const FIN_IMPULSO_S = 0.13;

/**
 * Los perfiles. Por lado afectado: rango de ganancia del reflejo y las
 * sacadas, cada una con su latencia desde el disparo del pulso (s) y la
 * fracción del error que corrige. El disparo cae ~60 ms antes del pico de la
 * cabeza y el impulso termina ~130 ms después del disparo: una sacada antes
 * de eso es encubierta, una después, manifiesta.
 *
 * La ventana de las encubiertas es angosta a propósito: más temprano, la
 * sacada se superpone con el arrastre y a 30 fps no llega a los 80 °/s que el
 * detector pide, así que no se marcaría; más tarde, ya es manifiesta.
 *
 * `patron` es la respuesta en las opciones de «Casos a ciegas» (PATRONES de
 * tutorial-pasos.js), para que el modo a ciegas pregunte lo mismo.
 */
export const PERFILES = {
  'neuritis-der': {
    nombre: 'Neuritis vestibular derecha',
    patron: 'unilateral-der',
    descripcion: 'Déficit del canal lateral derecho, agudo: ganancia baja y sacadas manifiestas que llegan tarde y a destiempo.',
    lados: { derecha: { ganancia: [0.35, 0.55], sacadas: [{ latencia: [0.2, 0.34], fraccion: 1 }] } },
  },
  'neuritis-izq': {
    nombre: 'Neuritis vestibular izquierda',
    patron: 'unilateral-izq',
    descripcion: 'Déficit del canal lateral izquierdo, agudo: ganancia baja y sacadas manifiestas que llegan tarde y a destiempo.',
    lados: { izquierda: { ganancia: [0.35, 0.55], sacadas: [{ latencia: [0.2, 0.34], fraccion: 1 }] } },
  },
  'encubierto-izq': {
    nombre: 'Déficit izquierdo compensado con sacadas encubiertas',
    patron: 'encubierto-izq',
    descripcion:
      'Déficit izquierdo en el que el cerebro aprendió a corregir durante el giro: sacadas encubiertas, agrupadas y tempranas. La ganancia de área se lee normal: el falso negativo.',
    lados: { izquierda: { ganancia: [0.4, 0.55], sacadas: [{ latencia: [0.095, 0.11], fraccion: 1 }] } },
  },
  'encubierto-der': {
    nombre: 'Déficit derecho compensado con sacadas encubiertas',
    patron: 'encubierto-der',
    descripcion:
      'Déficit derecho en el que el cerebro aprendió a corregir durante el giro: sacadas encubiertas, agrupadas y tempranas. La ganancia de área se lee normal: el falso negativo.',
    lados: { derecha: { ganancia: [0.4, 0.55], sacadas: [{ latencia: [0.095, 0.11], fraccion: 1 }] } },
  },
  bilateral: {
    nombre: 'Vestibulopatía bilateral',
    patron: 'bilateral',
    descripcion: 'Los dos canales laterales con ganancia baja y sacadas manifiestas en los dos lados. La asimetría queda cerca de cero.',
    lados: {
      derecha: { ganancia: [0.3, 0.5], sacadas: [{ latencia: [0.2, 0.32], fraccion: 1 }] },
      izquierda: { ganancia: [0.3, 0.5], sacadas: [{ latencia: [0.2, 0.32], fraccion: 1 }] },
    },
  },
  // El control: pulsos marcados como simulados pero sin nada agregado. Sin él,
  // «uno al azar» siempre tendría algo y la respuesta nunca sería «normal»:
  // se aprendería a buscar la patología en vez de a leer.
  sano: {
    nombre: 'Sin patología (control)',
    patron: 'normal',
    descripcion: 'Los dos canales laterales sanos: el motor no agregó nada. Las ganancias y las sacadas que se vieron son las del compañero.',
    lados: {},
  },
};

/** Generador determinista (mulberry32): el mismo pulso da la misma simulación. */
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const entre = (r, [a, b]) => a + (b - a) * r();

/**
 * Los parámetros de un pulso: la ganancia del reflejo y cuándo corrige cada
 * sacada. null si el perfil deja ese lado sano.
 *
 * @returns {{ganancia:number, sacadas:Array<{t:number, fraccion:number}>}|null}
 */
export function parametrosPulso(perfil, lado, semilla) {
  const p = PERFILES[perfil]?.lados[lado];
  if (!p) return null;
  const r = azar(semilla);
  return {
    ganancia: entre(r, p.ganancia),
    sacadas: p.sacadas.map((s) => ({ t: entre(r, s.latencia), fraccion: s.fraccion })),
  };
}

/**
 * Cuánto se corre la mirada simulada en cada cuadro, en grados, con el signo
 * de la cabeza.
 *
 * El arrastre se acumula por incrementos: cada vez que la cabeza gira rápido,
 * la mirada se va con ella `(1 − g)` de ese giro. Una sacada corrige su
 * `fraccion` del arrastre acumulado HASTA que empieza, en `DURACION_SACADA_S`;
 * lo que la cabeza siga arrastrando después no lo corrige esa sacada. Un
 * incremento `i` queda multiplicado por `1 − f·suave(…)` de cada sacada que
 * arrancó después de él.
 *
 * @param {Array<{t:number, yaw:number}>} crudo  cuadros en orden, `t` en s
 * @param {number} tTrigger  disparo del pulso, en s
 * @returns {number[]} un corrimiento por cuadro
 */
export function arrastre(crudo, tTrigger, params) {
  const out = new Array(crudo.length).fill(0);
  if (!params) return out;
  const sacadas = params.sacadas.map((s) => ({ ...s, t0: tTrigger + s.t }));
  const inc = crudo.map((c, i) => {
    if (i === 0) return { t: c.t, d: 0 };
    const dt = c.t - crudo[i - 1].t;
    const dYaw = c.yaw - crudo[i - 1].yaw;
    const v = dt > 0 ? Math.abs(dYaw / dt) : 0;
    const peso = suave((v - V_DESDE) / (V_HASTA - V_DESDE));
    return { t: c.t, d: (1 - params.ganancia) * dYaw * peso };
  });
  for (let k = 0; k < crudo.length; k++) {
    const t = crudo[k].t;
    let d = 0;
    for (let i = 0; i <= k; i++) {
      let m = 1;
      for (const s of sacadas) {
        if (s.t0 >= inc[i].t) m *= 1 - s.fraccion * suave((t - s.t0) / DURACION_SACADA_S);
      }
      d += inc[i].d * m;
    }
    out[k] = d;
  }
  return out;
}

/**
 * El corrimiento del iris que habría dado una mirada corrida `dMirada`
 * grados, leída con el mismo modelo que usa el motor:
 *
 *   sin(mirada) = offset/R + k·sin(H)   ⇒   offset = R·(sin(mirada) − k·sin(H))
 */
export function offsetConMirada(offsetMm, yawDeg, dMirada, { radiusMm = EYE_ROTATION_RADIUS_MM, kParallax }) {
  const h = rad(yawDeg);
  const s = Math.max(-0.999, Math.min(0.999, offsetMm / radiusMm + kParallax * Math.sin(h)));
  const mirada = deg(Math.asin(s)) + dMirada;
  return radiusMm * (Math.sin(rad(mirada)) - kParallax * Math.sin(h));
}

/**
 * El crudo de un pulso con el perfil aplicado. Devuelve un crudo NUEVO: el
 * real se guarda aparte para poder revelarlo.
 */
export function simulaCrudo(crudo, tTrigger, params, model) {
  const d = arrastre(crudo, tTrigger, params);
  return crudo.map((c, i) => (d[i] ? { ...c, offsetMm: offsetConMirada(c.offsetMm, c.yaw, d[i], model) } : { ...c }));
}
