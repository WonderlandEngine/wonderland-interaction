import { mat4, quat, quat2, vec3 } from "gl-matrix";

class StaticStack<T> {
    private _data: Float32Array;
    private _views: T[];
    private _sentinel = 0;

    constructor(componentCount: number, maxCount: number = 8) {
        this._data = new Float32Array(maxCount * componentCount);
        this._views = new Array(maxCount);
        const bytesPerElement = componentCount * Float32Array.BYTES_PER_ELEMENT;
        for(let i = 0; i < maxCount; ++i) {
            this._views[i] = new Float32Array(this._data.buffer, i * bytesPerElement, componentCount) as T;
        }
    }

    acquire() {
        return this._views[this._sentinel++];
    }

    free(count = 1) {
        this._sentinel -= count;
    }
}

/**
 * Stack of vector 3 temporaries.
 *
 * @hidden
 */
export const TempVec3 = new StaticStack<vec3>(3);
/**
 * Stack of quaternion temporaries.
 *
 * @hidden
 */
export const TempQuat = new StaticStack<quat>(4);
/**
 * Stack of quaternion temporaries.
 *
 * @hidden
 */
export const TempDualQuat = new StaticStack<quat2>(8);
/**
 * Stack of 4x4 matrix temporaries.
 *
 * @hidden
 */
export const TempMat4 = new StaticStack<mat4>(16);
