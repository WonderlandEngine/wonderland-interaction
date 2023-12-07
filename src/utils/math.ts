import {NumberArray, Object3D} from '@wonderlandengine/api';
import {quat, quat2, vec3} from 'gl-matrix';

/** Temporaries. */
const _pointA = vec3.create();
const _pointB = vec3.create();
const _rotationA = quat.create();
const _rotationB = quat.create();

export function toRad(degrees: number) {
    return (degrees * Math.PI) / 180.0;
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
 * Compute the relative transformation from source to target.
 *
 * @note The result transform is expressed in the target's space.
 *
 * @note In order to get the world transform of `source`, the target's world
 * transform will need to be multiplied by the result of this function.
 *
 * @param source The source object.
 * @param target The target object.
 * @param out The destination.
 * @returns The `out` parameter.
 */
export function computeRelativeTransform(
    source: Object3D,
    target: Object3D,
    out: quat2 = quat2.create()
): quat2 {
    const handToLocal = target.getRotationWorld(_rotationA);
    quat.invert(handToLocal, handToLocal);

    /* Transform rotation into target's space */
    const rot = source.getRotationWorld(_rotationB);
    quat.multiply(rot, handToLocal, rot);

    /* Transform position into target's space */
    const position = source.getPositionWorld(_pointA);
    const handPosition = target.getPositionWorld(_pointB);
    vec3.sub(position, position, handPosition);
    vec3.transformQuat(position, position, handToLocal);

    quat2.fromRotationTranslation(out, rot, position);
    return out;
}

export function absMaxVec3(out: vec3, a: vec3, b: vec3): vec3 {
    const v1 = Math.abs(a[0]) + Math.abs(a[1]) + Math.abs(a[2]);
    const v2 = Math.abs(b[0]) + Math.abs(b[1]) + Math.abs(b[2]);

    if (v1 > v2) {
        return vec3.copy(out, a);
    }
    return vec3.copy(out, b);
}
