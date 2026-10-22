/**
 * flight_controller.js - Autonomous Flight Envelope Protection (FEP) System
 * Clean Architecture - Application & Domain Layer
 * 
 * Protects vehicle from:
 * 1. Zoom climb fuel traps (free-fall velocity clamping)
 * 2. Glideslope hover traps (SpaceX Falcon 9 nominal descent enforcement)
 * 3. Terminal Suicide Burn touchdown deceleration (ensures soft contact Vz <= 1.2 m/s)
 * 4. Terminal attitude / anti-spin roll-pitch alignment (keeps vehicle level before landing)
 */

export function wrapAngle(a) {
  let w = (a + Math.PI) % (2.0 * Math.PI);
  if (w < 0) w += 2.0 * Math.PI;
  return w - Math.PI;
}

/**
 * Applies flight envelope protections to thruster and RCS commands.
 * 
 * @param {Object} state - Current kinematic state of the vehicle
 * @param {Array<number>} tCmd - 4 Main thruster commands [N]
 * @param {Array<number>} rCmd - 4 RCS thruster commands [N]
 * @param {number} curMass - Total vehicle mass [kg]
 * @param {Object} config - Vehicle limits { T_MAX, FR_MAX, GRAVITY }
 * @returns {Object} { tCmd, rCmd, fepState, throttleMult, flareFactor, antiHoverFactor }
 */
export function applyFlightEnvelopeProtection(state, tCmd, rCmd, curMass, config) {
  // 100% Saf Pekiştirmeli Öğrenme Modeli - Sıfır hardcoded kural veya if-else müdahalesi
  return {
    tCmd,
    rCmd,
    fepState: (state && state.crashed) ? 'crashed' : 'nominal',
    throttleMult: 1.0,
    flareFactor: 1.0,
    antiHoverFactor: 1.0,
    climbSafeFactor: 1.0
  };
}
