import {vec3, vec4} from 'gl-matrix';
import {
    Component,
    ComponentConstructor,
    InputComponent,
    InputType,
    MeshComponent,
    Object3D,
    Prefab,
} from '@wonderlandengine/api';

/* Temporaries */
const _vectorA = vec3.create();
const _boundingSphere = vec4.create();

/**
 * Convert a TypeScript syntactic sugar enum to a list of keys.
 *
 * This method filters the reverse mapping from value to key.
 *
 * @note Index mapping must be contiguous and 0-based.
 *
 * @param e Enum to retrieve the keys from
 * @returns The list of keys
 */
export function enumStringKeys<T extends object>(e: T): (keyof T)[] {
    return Object.keys(e).filter((v) => isNaN(v as unknown as number)) as (keyof T)[];
}

/**
 * Merges two bounding spheres into one that encompasses both.
 *
 * This function calculates the smallest bounding sphere that contains both the 'out'
 * and 'other' bounding spheres. It updates the 'out' bounding sphere to be this
 * encompassing sphere.
 *
 * @param out The bounding sphere to merge into and to be updated.
 * @param other The bounding sphere to merge from.
 * @returns The updated 'out' bounding sphere.
 *
 * @example
 * const sphereA = vec4.fromValues(0, 0, 0, 1); // Center at origin with radius 1
 * const sphereB = vec4.fromValues(2, 0, 0, 1); // Center at (2, 0, 0) with radius 1
 * joinBoundingSphere(sphereA, sphereB); // sphereA now encompasses both spheres
 *
 * @internal
 */
function joinBoundingSphere(out: vec4, other: vec4): vec4 {
    if (other[3] <= 0.00001) {
        return out;
    }

    if (other[3] <= 0.00001) {
        vec3.copy(out as vec3, other as vec3);
        return out;
    }

    /* Vector from this sphere to the other, used to translate the center. */
    const thisToOther = vec3.subtract(_vectorA, other as vec3, out as vec3);
    const distSq = vec3.dot(thisToOther, thisToOther);

    /* Case 1: Spheres are fully overlapping. */
    const thisRadius = out[3];
    const otherRadius = other[3];
    const radiusDiff = thisRadius - otherRadius;
    if (distSq <= radiusDiff * radiusDiff) {
        if (otherRadius > thisRadius) {
            vec4.copy(out, other);
        }
        return out;
    }
    /* Case 2: Apart or slightly overlapping. */
    const dist = Math.sqrt(distSq);
    const newRadius = (dist + thisRadius + otherRadius) * 0.5;

    vec3.scaleAndAdd(
        out as vec3,
        out as vec3,
        thisToOther,
        (newRadius - thisRadius) / dist
    );
    out[3] = newRadius;
    return out;
}

/**
 * Recursively computes the bounding sphere of an Object3D hierarchy.
 *
 * The function traverses the hierarchy of the target Object3D and calculates a bounding sphere
 * that includes all the MeshComponents in the hierarchy. The result is a sphere in world space
 * that encloses the entire object hierarchy.
 *
 * @param out The resulting bounding sphere that will be updated to include the target.
 * @param target The root Object3D of the hierarchy to compute the bounding sphere from.
 * @returns The updated 'out' bounding sphere that contains the entire hierarchy.
 *
 * @example
 * // Assuming 'rootObject' is the root of your Object3D hierarchy with MeshComponents
 * const boundingSphere = vec4.create();
 * radiusHierarchyRec(boundingSphere, rootObject);
 * console.log(`Bounding sphere radius: ${boundingSphere[3]}`);
 *
 * @internal
 */
function radiusHierarchyRec(out: vec4, target: Object3D): vec4 {
    const children = target.children;
    for (const child of children) {
        radiusHierarchyRec(out, child);
    }

    const mesh = target.getComponent(MeshComponent);
    if (!mesh || !mesh.mesh) {
        return out;
    }

    mesh.mesh.getBoundingSphere(_boundingSphere);
    const worldScale = target.getScalingWorld();
    _boundingSphere[3] *= vec3.length(worldScale);
    joinBoundingSphere(out, _boundingSphere);

    return out;
}

/**
 * Calculates the world space radius of an Object3D hierarchy.
 *
 * The function returns the radius of a bounding sphere that encloses all mesh components
 * in the hierarchy of the provided Object3D. This can be useful for visibility testing,
 * collision detection, or spatial queries within a 3D environment.
 *
 * @param object The root Object3D of the hierarchy to calculate the world space radius for.
 * @returns The radius of the world space bounding sphere.
 *
 * @example
 * // Assuming 'rootObject' is the root of your Object3D hierarchy with mesh components
 * const worldRadius = radiusHierarchy(rootObject);
 * console.log(`World space radius: ${worldRadius}`);
 */
export const radiusHierarchy = (function () {
    const temp = vec4.create();
    return function (object: Object3D): number {
        vec4.zero(temp);
        return radiusHierarchyRec(temp, object)[3];
    };
})();

/**
 * Recursively sets the active state of the given object and all its children.
 * @param object The object to set the active state of.
 * @param active The state to set.
 *
 * @example
 * ```js
 * // turn off all components on this object and its children
 * setComponentsActive(this.someObject, undefined, false);
 * ```
 */
export function setComponentsActive(
    object: Object3D,
    active: boolean,
    typeClass?: ComponentConstructor
) {
    // TODO: Fix typing in wonderlandengine/api
    const components = object.getComponents(typeClass as any);
    for (const comp of components) {
        comp.active = active;
    }
    const children = object.children;
    for (const child of children) {
        setComponentsActive(child, active, typeClass);
    }
}

export function componentError(component: Component, msg: string) {
    const ctor = component.constructor as ComponentConstructor;
    return `${ctor.TypeName}(${component.object.name}): ${msg}`;
}
