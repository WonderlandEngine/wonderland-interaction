import {quat, quat2, vec3} from 'gl-matrix';

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
 * Compute the relative transformation from source to target.
 *
 * @note
 * - The result transform is expressed in the target's space.
 * - In order to get the world transform of `source`, the target's world
 *   transform will need to be multiplied by the result of this function.
 *
 * @param out The destination.
 * @param source The source object.
 * @param target The target object.
 * @returns The `out` parameter.
 */
export const computeRelativeTransform = (function () {
    const _rotation = quat.create();
    const _pointA = vec3.create();
    const _pointB = vec3.create();

    return function (out: quat2, source: quat2, target: quat2) {
        const handToLocal = quat2.getReal(_rotation, target);
        quat.invert(handToLocal, handToLocal);

        /* Transform rotation into target's space */
        quat2.getReal(out, source);
        quat.multiply(out as quat, handToLocal, out as quat);
        quat.normalize(out, out);

        /* Transform position into target's space */
        const position = quat2.getTranslation(_pointA, source);
        const handPosition = quat2.getTranslation(_pointB, target);
        vec3.sub(position, position, handPosition);
        vec3.transformQuat(position, position, handToLocal);

        return quat2.fromRotationTranslation(out, out, position);
    };
})();
