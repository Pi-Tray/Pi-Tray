import {Link} from "wouter";
import {usePathname} from "wouter/use-browser-location";

import {Code, Images, LayoutGrid, Settings, Tablet, ToyBrick} from "lucide-react";
import {motion, AnimatePresence} from "motion/react";
import {useConfigValue} from "../util/config";

interface LeftNavItemProps {
    icon: React.ReactNode;
    title: string;
    href: string;

    className?: string;
    link_className?: string;

    mark_if_nested?: boolean;
}

/**
 * An item in the left navigation bar.
 * @param href the path to link to
 * @param title the title of the item, shown in a tooltip
 * @param icon the icon to display
 * @param className additional class names for the list item
 * @param link_className additional class names for the link
 * @param mark_if_nested whether to mark the nav item if the pathname is a nested path of the href, e.g. `/foo/bar` for `href="/foo"` (default: false)
 * @returns the element
 */
const LeftNavItem = ({href, title, icon, className = "", link_className = "", mark_if_nested = false}: LeftNavItemProps) => {
    const pathname = usePathname();

    let is_active = pathname === href;
    if (mark_if_nested) {
        // check if the current pathname starts with the href
        is_active = pathname.startsWith(href);
    }

    return (
        <li className={`indicator ${className}`}>
            <AnimatePresence>
                {is_active &&
                    <motion.div initial={{scale: 0}} animate={{scale: 1}} exit={{scale: 0}} className="indicator-item indicator-middle indicator-start flex flex-col items-center justify-center pointer-events-none">
                        <div className="rounded-full h-2 w-2 aspect-square bg-primary"></div>
                    </motion.div>
                }
            </AnimatePresence>
            <Link href={href} className={`tooltip tooltip-right ${link_className}`} data-tip={title}>
                {icon}
            </Link>
        </li>
    );
}

export const LeftNav = () => {
    const [show_devtools] = useConfigValue("devtools");

    return (
      <ul className="menu h-full bg-base-300">
          <LeftNavItem href="/" title="Grid Editor" icon={<LayoutGrid />} />
          <LeftNavItem href="/device" title="Device" icon={<Tablet />} />
          <LeftNavItem href="/plugins" title="Plugin Manager" icon={<ToyBrick />} />
          <LeftNavItem href="/assets" title="Asset Manager" icon={<Images />} />

          <div className="mt-auto w-0">
              <AnimatePresence>
                  {show_devtools &&
                      <motion.div initial={{x: -100}} animate={{x: 0}} exit={{x: -100}}>
                          <LeftNavItem href="/devtools" title="Developer Tools" icon={<Code />} mark_if_nested={true} />
                      </motion.div>
                  }
              </AnimatePresence>

              <LeftNavItem href="/settings" title="Settings" icon={<Settings />} />
          </div>
      </ul>
    );
}
