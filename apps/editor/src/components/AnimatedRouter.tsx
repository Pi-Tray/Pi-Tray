import {cloneElement} from "react";
import {useRoutes} from "../hooks/useRoutes";

import {AnimatePresence, motion} from "motion/react";

interface AnimatedRouterProps {
    routes: {[path: string]: JSX.Element};
    not_found?: JSX.Element;

    animation_props?: React.ComponentProps<typeof motion.div>;
}

/**
 * A wouter router that transitions between routes using `motion`.
 * @param routes an object where keys are paths and values are the corresponding route elements
 * @param not_found an optional element to render when no routes match (defaults to an empty fragment)
 * @param animation_props optional props to pass to the `motion.div` element for custom animations (but if you don't, it won't animate anything)
 * @returns the element for the current route, wrapped in `AnimatePresence` and `motion.div` for animations
 */
export const AnimatedRouter = ({routes, not_found, animation_props = {}}: AnimatedRouterProps) => {
    const element = useRoutes(routes) || not_found || <></>;

    return (
        <AnimatePresence mode="popLayout">
            <motion.div {...animation_props} key={location.pathname}>
                {cloneElement(element)}
            </motion.div>
        </AnimatePresence>
    );
}
