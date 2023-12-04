import {Object3D} from '@wonderlandengine/api';
import {mat4, quat, vec3} from 'gl-matrix';

/** Temporaries. */
const _quat = quat.create();

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
    quat.multiply(out, quat.invert(_quat, src), dst);
    return quat.normalize(out, out);
}

/**
 *
 */
export function computeRelativeTransform(
    source: Object3D,
    target: Object3D,
    out: mat4 = mat4.create()
): mat4 {
    const handPos = target.getPositionWorld();
    const handRotInv = target.getRotationWorld(quat.create());
    quat.invert(handRotInv, handRotInv);

    /* Transform rotation into interactor's space */
    const rot = source.getRotationWorld(quat.create());
    quat.multiply(rot, handRotInv, rot);

    /* Transform position into interactor's space */
    const trans = source.getPositionWorld(vec3.create());
    vec3.sub(trans, trans, handPos);
    vec3.transformQuat(trans, trans, handRotInv);

    /* Local transformation matrix relative to the interactor's space. */
    mat4.fromRotationTranslation(out, rot, trans);

    return out;
}
