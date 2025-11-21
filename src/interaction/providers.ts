import {mat4, quat, vec3} from 'gl-matrix';
import {FORWARD, UP} from '../constants.js';
import {Object3D} from '@wonderlandengine/api';

export function rotateAroundPivot(out: quat, axis: vec3, handle: vec3): quat {
    /* This functon assumes `handle` is in the pivot space */
    const objectToHandle = vec3.normalize(vec3.create(), handle);

    /* Project vector onto plane defined by axis */
    const vDotN = vec3.dot(objectToHandle, axis);
    const projected = vec3.scale(vec3.create(), axis, vDotN);
    vec3.sub(projected, objectToHandle, projected);
    vec3.normalize(projected, projected);

    // TODO: Optimize as a parameter.
    const worldUp = vec3.dot(axis, UP) < 0.5 ? UP : FORWARD;
    const forward = vec3.cross(vec3.create(), worldUp, axis);
    vec3.normalize(forward, forward);

    return quat.rotationTo(out, forward, projected);
}

export function rotateAroundPivotDual(out: quat, axis: vec3, handle1: vec3, handle2: vec3) {
    const rotationA = rotateAroundPivot(quat.create(), axis, handle1);
    const rotationB = rotateAroundPivot(quat.create(), axis, handle2);
    quat.lerp(out, rotationA, rotationB, 0.5);
    quat.normalize(out, out);
    return out;
}

export function rotateFreeDual(source: vec3, target: vec3, up: vec3, out: quat) {
    const mat = mat4.lookAt(mat4.create(), source, target, up);
    mat4.invert(mat, mat);
    mat4.getRotation(out, mat);
    return out;
}

export function computeLocalPositionForPivot(target: Object3D, positionWorld: vec3): vec3 {
    const parent = target.parent ?? target.scene.wrap(0);
    const handParentSpace = parent.transformPointInverseWorld(positionWorld);
    return vec3.subtract(vec3.create(), handParentSpace, target.getPositionLocal());
}
