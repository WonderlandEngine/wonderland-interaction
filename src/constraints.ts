import {Component, property} from '@wonderlandengine/api';
import {quat, vec3} from 'gl-matrix';
import {toDegree} from './utils/math.js';
import {TempVec3} from './internal-constants.js';

function initializeBounds(min: vec3, max: vec3, outMin: vec3, outMax: vec3) {
    vec3.set(
        outMin,
        Number.NEGATIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.NEGATIVE_INFINITY
    );
    vec3.set(
        outMax,
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY
    );
    /* Could be unrolled, but it's unlikely to have performance issues */
    for (let i = 0; i < 3; ++i) {
        if (min[i] > max[i]) continue;
        outMin[i] = min[i];
        outMax[i] = max[i];
    }
}

/**
 * Translation constraint components for **local** position.
 */
export class TranslationConstraint extends Component {
    static TypeName = 'translation-constraint';

    /**
     * Minimum allowed position, in **local space**.
     *
     * @note To disable constraint on an axis, use a value larger
     * than {@link max}. e.g.,
     *
     * ```ts
     * // Disable constraint for the x axis
     * constraint.min[0] = 1;
     * constraint.max[0] = -1;
     * ```
     */
    @property.vector3(1, 1, 1)
    min!: Float32Array;

    /**
     * Maximum allowed position, in **local space**.
     *
     * @note To disable constraint on an axis, use a value smaller
     * than {@link min}. e.g.,
     *
     * ```ts
     * // Disable constraint for the x axis
     * constraint.min[0] = 1;
     * constraint.max[0] = -1;
     * ```
     */
    @property.vector3(-1, -1, -1)
    max!: Float32Array;

    /** @override */
    update(): void {
        const min = TempVec3.get();
        const max = TempVec3.get();
        initializeBounds(this.min, this.max, min, max);

        const pos = this.object.getPositionLocal(TempVec3.get());
        vec3.min(pos, pos, max);
        vec3.max(pos, pos, min);
        this.object.setPositionLocal(pos);

        TempVec3.free(3);
    }
}

function getEulerFromQuat(out: vec3, q: quat) {
    const [x, y, z, w] = q;

    // Roll (x-axis rotation)
    const sinr_cosp = 2 * (w * x + y * z);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);

    // Pitch (y-axis rotation)
    const sinp = 2 * (w * y - z * x);
    let pitch;
    if (Math.abs(sinp) >= 1) {
        pitch = (Math.sign(sinp) * Math.PI) / 2; // use 90 degrees if out of range
    } else {
        pitch = Math.asin(sinp);
    }

    // Yaw (z-axis rotation)
    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);

    out[0] = roll;
    out[1] = pitch;
    out[2] = yaw;
    return out;
}

/**
 * Rotation constraint components for **local** position.
 *
 * @note This component currently decomposes the rotation into euler angles,
 * which might create glimbal lock. In addition, the yaw/pitch/roll order is
 * currently not exposed.
 */
export class RotationConstraint extends Component {
    static TypeName = 'rotation-constraint';

    @property.bool(false)
    lockX = false;

    @property.bool(false)
    lockY = false;

    @property.bool(false)
    lockZ = false;

    /**
     * Minimum allowed rotation, in **degrees**, in **local space**.
     *
     * @note To disable constraint on an axis, use a value larger
     * than {@link max}. e.g.,
     *
     * ```ts
     * // Disable constraint for the x axis
     * constraint.min[0] = 1;
     * constraint.max[0] = -1;
     * ```
     */
    @property.vector3()
    min!: Float32Array;

    /**
     * Maximum allowed rotation, in **degrees**, in **local space**.
     *
     * @note To disable constraint on an axis, use a value larger
     * than {@link max}. e.g.,
     *
     * ```ts
     * // Disable constraint for the x axis
     * constraint.min[0] = 1;
     * constraint.max[0] = -1;
     * ```
     */
    @property.vector3()
    max!: Float32Array;

    private _locked = [false, false, false];

    /** @override */
    onActivate(): void {
        this._locked[0] = this.lockX;
        this._locked[1] = this.lockY;
        this._locked[2] = this.lockZ;
    }

    /** @override */
    update(): void {
        const rot = this.object.getRotationLocal(quat.create());

        /** @todo: Split 1/2/3 DoF constraints.
         * The current constraint logic is too simplistic and will not hold */

        const min = TempVec3.get();
        const max = TempVec3.get();
        initializeBounds(this.min, this.max, min, max);

        const angles = getEulerFromQuat(TempVec3.get(), rot);
        for (let i = 0; i < 3; ++i) {
            angles[i] = !this._locked[i] ? toDegree(angles[i]) : 0;
        }
        vec3.min(angles, angles, max);
        vec3.max(angles, angles, min);

        quat.fromEuler(rot, angles[0], angles[1], angles[2]);
        this.object.setRotationLocal(rot);

        TempVec3.free(3);
    }
}
