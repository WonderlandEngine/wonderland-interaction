import {Object3D} from '@wonderlandengine/api';
import {quat, quat2, vec3, vec4} from 'gl-matrix';

/** Temporaries. */
const _pointA = vec3.create();
const _pointB = vec3.create();
const _rotationA = quat.create();
const _rotationB = quat.create();

/**
 * Convert degrees to radians.
 *
 * @param degrees Value, in **degrees**.
 */
export function toRad(degrees: number) {
    return (degrees * Math.PI) / 180.0;
}

/**
 * Convert radians to degrees.
 *
 * @param degrees Value, in **radians**.
 */
export function toDegree(radians: number) {
    return (radians * 180) / Math.PI;
}

/**
 * Compute the delta between `src` and the `dst` quaternion.
 *
 * @param out The output.
 * @param src The source quaternion.
 * @param dst The destination quaternion.
 *
 * @returns The `out` parameter.
 */
export function quatDelta(out: quat, src: quat, dst: quat): quat {
    // Detla = to * inverse(from).
    quat.multiply(out, quat.invert(_rotationA, src), dst);
    return quat.normalize(out, out);
}

/**
 * Check whether two points are **almost** equal.
 *
 * @param a Source point.
 * @param b Target point.
 * @param epsilon Epsilon threshold.
 * @returns `true` if almost equal, `false` otherwise.
 */
export function isPointEqual(a: vec3, b: vec3, epsilon: number) {
    return (
        Math.abs(a[0] - b[0]) < epsilon &&
        Math.abs(a[1] - b[1]) < epsilon &&
        Math.abs(a[2] - b[2]) < epsilon
    );
}

/**
 * Check whether two rotations are **almost** equal.
 *
 * @param a Source rotation.
 * @param b Target rotation.
 * @param epsilon Epsilon threshold.
 * @returns `true` if almost equal, `false` otherwise.
 */
export function isQuatEqual(a: quat, b: quat, epsilon: number) {
    return quat.getAngle(a, b) < epsilon;
}

/**
 * Compute the relative transformation from source to target.
 *
 * @remarks
 * - The result transform is expressed in the target's space.
 * - In order to get the world transform of `source`, the target's world
 *   transform will need to be multiplied by the result of this function.
 *
 * @param source The source object.
 * @param target The target object.
 * @param out The destination.
 * @returns The `out` parameter.
 */
export function computeRelativeTransform(
    source: Object3D,
    target: Object3D,
    out: quat2
): quat2 {
    const handToLocal = target.getRotationWorld(_rotationA);
    quat.invert(handToLocal, handToLocal);

    /* Transform rotation into target's space */
    const rot = source.getRotationWorld(_rotationB);
    quat.multiply(rot, handToLocal, rot);
    quat.normalize(rot, rot);

    /* Transform position into target's space */
    const position = source.getPositionWorld(_pointA);
    const handPosition = target.getPositionWorld(_pointB);
    vec3.sub(position, position, handPosition);
    vec3.transformQuat(position, position, handToLocal);

    return quat2.fromRotationTranslation(out, rot, position);
}

export function computeRelativeRotation(source: quat, target: quat, out: quat) {
    const toLocal = quat.copy(_rotationA, target);
    quat.invert(toLocal, toLocal);
    quat.multiply(out, toLocal, source);
    return quat.normalize(out, out);
}
