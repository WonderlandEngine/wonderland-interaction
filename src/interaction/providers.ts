import {mat4, quat, vec3} from 'gl-matrix';
import {FORWARD, UP} from '../constants.js';
import {Object3D} from '@wonderlandengine/api';

/**
 * Absolute rotation around an axis.
 *
 * @param out Result.
 * @param axis Axis to rotate around. Should be normalized.
 * @param target Normalized origin to target vector, used to compute the rotation.
 */
export const rotateAroundPivot = (function () {
    const _vectorA = vec3.create();
    const _vectorB = vec3.create();

    return function (out: quat, axis: vec3, target: vec3): quat {
        const worldUp = vec3.dot(axis, UP) < 0.5 ? UP : FORWARD;
        const forward = vec3.cross(_vectorA, worldUp, axis);
        vec3.normalize(forward, forward);

        /* Project vector onto plane defined by axis */
        const vDotN = vec3.dot(target, axis);
        const projected = vec3.scale(_vectorB, axis, vDotN);
        vec3.sub(projected, target, projected);
        vec3.normalize(projected, projected);

        quat.rotationTo(out, forward, projected);
        quat.normalize(out, out);

        return out;
    };
})();

/**
 * LookAt with quaternions.
 *
 * @param out Result.
 * @param source Source position
 * @param target Target position
 * @param up Up vector
 */
export const rotateFreeDual = (function () {
    const _mat = mat4.create();
    return function (out: quat, source: vec3, target: vec3, up: vec3) {
        const mat = mat4.lookAt(_mat, source, target, up);
        mat4.invert(mat, mat);
        mat4.getRotation(out, mat);
        return quat.normalize(out, out);
    };
})();

export const computeLocalPositionForPivot = (function () {
    const _point = vec3.create();
    return function (out: vec3, target: Object3D, position: vec3): vec3 {
        /* Use grabbable parent space for the rotation to avoid taking into account
         * the actual undergoing grabbable rotation. */
        const parent = target.parent ?? target.scene.wrap(0);
        const handParentSpace = parent.transformPointInverseWorld(_point, position);
        vec3.subtract(out, handParentSpace, target.getPositionLocal(out));
        return out;
    };
})();
