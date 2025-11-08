import {ComponentConstructor, Object3D} from '@wonderlandengine/api';

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
