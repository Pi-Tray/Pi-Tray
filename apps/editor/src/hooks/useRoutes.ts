import { useState, cloneElement } from "react";
import { useRoute } from "wouter";

/**
 * A hook to collect multiple routes and return the first matched route element.<br>
 * This isn't shipped with wouter, but is written by the author of wouter.<br>
 * This is a good alternative for `wouter`'s `Switch` component when custom logic is needed.
 * Author: molefrog (Alexey Taktarov), adapted to use an object to map routes rather than an array.
 * @param routes routes to observe, an object where keys are paths and values are the corresponding route elements
 * @returns the first matched route element or `null` if no routes match
 */
export const useRoutes = (routes: {[path: string]: JSX.Element}) => {
    // save the length of the `routes` key array that we receive on the first render
    const [routesLen] = useState(() => Object.keys(routes).length);

    // because we call `useRoute` inside a loop the number of routes can't be changed!
    // otherwise, it breaks the rule of hooks and will cause React to break
    if (routesLen !== Object.keys(routes).length) {
        throw new Error(
            "The length of `routes` array provided to `useRoutes` must be constant!"
        );
    }

    const matches = Object.keys(routes).map((path) => {
        return useRoute(path);
    });

    for (let [index, match] of matches.entries()) {
        const [isMatch, params] = match;

        if (isMatch) {
            const path = Object.keys(routes)[index];
            return cloneElement(routes[path], { params });
        }
    }

    return null;
};
