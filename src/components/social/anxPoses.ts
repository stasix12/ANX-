/*
 * WHERE THE EYES ARE, measured off the finished poses by scripts/anx-cutout.mjs.
 *
 * Generated. Run `node scripts/anx-cutout.mjs` to rebuild this and the nine
 * pose images together; editing it by hand would make it a guess, and the
 * eyelid it positions would land on the robot's cheek.
 *
 * A null means the character's eyes are already shut in that pose — he is
 * smiling with them closed — so there is nothing to blink.
 */
/** One eye light, in the 440x276 pose canvas. */
export type AnxEye = { x: number; y: number; w: number; h: number };
/** A pose whose eyes are open: both lights, left first, and the visor they
    sit on — the colour an eyelid has to be painted to close over them. */
export type AnxFace = { visor: string; eyes: readonly AnxEye[] };

/** The pose canvas every box below is measured in. */
export const POSE_W = 440;
export const POSE_H = 276;

export const ANX_FACES: readonly (AnxFace | null)[] = [
  /* 0 */ null,
  /* 1 */ { visor: '#0d1c3e', eyes: [{ x: 191, y: 91, w: 23, h: 21 }, { x: 236, y: 92, w: 19, h: 21 }] },
  /* 2 */ { visor: '#17275f', eyes: [{ x: 201, y: 73, w: 28, h: 30 }, { x: 248, y: 65, w: 17, h: 26 }] },
  /* 3 */ { visor: '#14285b', eyes: [{ x: 205, y: 75, w: 27, h: 30 }, { x: 250, y: 67, w: 18, h: 27 }] },
  /* 4 */ { visor: '#162856', eyes: [{ x: 204, y: 75, w: 25, h: 28 }, { x: 247, y: 68, w: 17, h: 26 }] },
  /* 5 */ null,
  /* 6 */ null,
  /* 7 */ null,
  /* 8 */ { visor: '#111d3c', eyes: [{ x: 190, y: 92, w: 23, h: 21 }, { x: 233, y: 97, w: 18, h: 18 }] },
];
