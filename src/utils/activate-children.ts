import {ComponentConstructor, Object3D} from '@wonderlandengine/api';

/**
 * Recursively sets the active state of the given object and all its children.
 * @param object The object to set the active state of.
 * @param active The state to set.
 *
 * @example
 * ```js
 * // turn off all components on this object and its children
 * setComponentsActive(this.someObject, false);
 * ```
 */
export function setComponentsActive(object: Object3D, active: boolean) {
    object.active = active;

    object.getComponents().forEach((c) => (c.active = active));

    object.children.forEach((c) => setComponentsActive(c, active));
}

export function setComponentsState(
    object: Object3D,
    typeClass: ComponentConstructor,
    active: boolean
) {
    const components = object.getComponents(typeClass);
    for (const comp of components) {
        comp.active = active;
    }
    const children = object.children;
    for (const child of children) {
        setComponentsState(child, typeClass, active);
    }
}
