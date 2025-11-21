import { vec3 } from "gl-matrix";

/** Epsilon floating point value. */
export const EPSILON = 0.000001;

export const UP = vec3.set(vec3.create(), 0, 1, 0);
export const FORWARD = vec3.set(vec3.create(), 0, 0, -1);
