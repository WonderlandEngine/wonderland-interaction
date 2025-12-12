import { Component } from "@wonderlandengine/api";
import { quat, vec3 } from "gl-matrix";

function rotateAroundPivotForward(
    out: quat,
    axis: vec3,
    forward: vec3,
    handle: vec3
): quat {
    /* This functon assumes `handle` is in the pivot space */
    const objectToHandle = vec3.normalize(vec3.create(), handle);

    /* Project vector onto plane defined by axis */
    const vDotN = vec3.dot(objectToHandle, axis);
    const projected = vec3.scale(vec3.create(), axis, vDotN);
    vec3.sub(projected, objectToHandle, projected);
    vec3.normalize(projected, projected);
    quat.rotationTo(out, forward, projected);
    quat.normalize(out, out);
    return out;
}

export function rotateAroundPivot(out: quat, axis: vec3, handle: vec3): quat {
    const worldUp = vec3.dot(axis, [0, 1, 0]) < 0.5 ? [0, 1, 0] : [0, 0, -1];
    const forward = vec3.cross(vec3.create(), worldUp as vec3, axis);
    vec3.normalize(forward, forward);
    rotateAroundPivotForward(out, axis, forward, handle);
    return out;
}

export class Debug extends Component {
    static TypeName = 'debug';

    pos0 = [
        0.9358490705490112,
        1.178532600402832,
        -2.517874240875244
    ] as vec3;

    pos1 = [
        1.2488263845443726,
        1.0418623685836792,
        -2.517874240875244
    ] as vec3;

    update(dt: number) {
        const r0 = quat.create();

        this.pos1[0] += dt * 5;
        this.pos1[2] += dt * 5;

        rotateAroundPivot(r0, [0, 0, -1], this.pos1 );

        const r1 = quat.create();
        rotateAroundPivot(r1, [0, 1, 0], this.pos1 );

        const rot = quat.create();
        quat.multiply(rot, r1, r0);
        quat.normalize(rot, rot);
        this.object.setRotationLocal(rot);
    }
}