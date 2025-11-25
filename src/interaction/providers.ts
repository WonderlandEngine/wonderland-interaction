import {mat4, quat, vec3} from 'gl-matrix';
import {FORWARD, UP} from '../constants.js';
import {Object3D} from '@wonderlandengine/api';
import {TempMat4, TempQuat, TempVec3} from '../internal-constants.js';

function rotateAroundPivotForward(
    out: quat,
    axis: vec3,
    forward: vec3,
    handle: vec3
): quat {
    /* This functon assumes `handle` is in the pivot space */
    const objectToHandle = vec3.normalize(TempVec3.get(), handle);

    /* Project vector onto plane defined by axis */
    const vDotN = vec3.dot(objectToHandle, axis);
    const projected = vec3.scale(TempVec3.get(), axis, vDotN);
    vec3.sub(projected, objectToHandle, projected);
    vec3.normalize(projected, projected);
    quat.rotationTo(out, forward, projected);
    quat.normalize(out, out);

    TempVec3.free(2);
    return out;
}

export function rotateAroundPivot(out: quat, axis: vec3, handle: vec3): quat {
    const worldUp = vec3.dot(axis, UP) < 0.5 ? UP : FORWARD;
    const forward = vec3.cross(TempVec3.get(), worldUp, axis);
    vec3.normalize(forward, forward);
    rotateAroundPivotForward(out, axis, forward, handle);

    TempVec3.free();
    return out;
}

export function rotateAroundPivotDual(out: quat, axis: vec3, handle1: vec3, handle2: vec3) {
    const worldUp = vec3.dot(axis, UP) < 0.5 ? UP : FORWARD;
    const forward = vec3.cross(TempVec3.get(), worldUp, axis);
    vec3.normalize(forward, forward);

    const rotationA = rotateAroundPivotForward(out, axis, forward, handle1);
    const rotationB = rotateAroundPivotForward(TempQuat.get(), axis, forward, handle2);
    quat.lerp(out, rotationA, rotationB, 0.5);
    quat.normalize(out, out);

    TempVec3.free();
    TempQuat.free();
    return out;
}

export function rotateFreeDual(source: vec3, target: vec3, up: vec3, out: quat) {
    const mat = mat4.lookAt(TempMat4.get(), source, target, up);
    mat4.invert(mat, mat);
    mat4.getRotation(out, mat);

    TempMat4.free();
    return out;
}

export function computeLocalPositionForPivot(
    out: vec3,
    target: Object3D,
    positionWorld: vec3
): vec3 {
    const parent = target.parent ?? target.scene.wrap(0);
    const handParentSpace = parent.transformPointInverseWorld(
        TempVec3.get(),
        positionWorld
    );
    vec3.subtract(out, handParentSpace, target.getPositionLocal());

    TempVec3.free();
    return out;
}
