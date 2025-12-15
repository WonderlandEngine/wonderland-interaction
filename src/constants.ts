import {quat, vec3} from 'gl-matrix';

/** Epsilon floating point value. */
export const EPSILON = 0.000001;
export const PI_OVER_2 = Math.PI * 0.5;

/** Zero vector3. */
export const ZERO_VEC3 = vec3.zero(vec3.create());
/** x axis. */
export const RIGHT = vec3.set(vec3.create(), 1, 0, 0);
/** y axis. */
export const UP = vec3.set(vec3.create(), 0, 1, 0);
/** z axis. */
export const FORWARD = vec3.set(vec3.create(), 0, 0, -1);
/**  */
export const GLOBAL_FRAME = [RIGHT, UP, FORWARD];

export const QUAT_FORWARD = quat.create();
export const QUAT_RIGHT = quat.rotationTo(quat.create(), FORWARD, RIGHT);
export const QUAT_UP = quat.rotationTo(quat.create(), FORWARD, RIGHT);
