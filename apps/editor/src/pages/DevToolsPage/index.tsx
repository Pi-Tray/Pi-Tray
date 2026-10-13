import {Link} from "wouter";

import {Cable, Logs, ToyBrick} from "lucide-react";

const SPLASH_TEXTS = [
    "What will it be today, my friend?",
    "You're really pushing my buttons 🤭",
    "pi = 3.14159265358979323846",
    "Should you learn JavaScript? Nope!\nIs there any other option? Nope!",
    "There's a library for that.",
    "jQuery? What are you? 5?\nWe use jjQuery.",
    "Yeah, I can write your hello world right now!\nLet's start with the test suite.",
    "How many bundles can a bundler bundle if a bundler can bundle bundles?",
    "You should really use TypeScript btw :D",
    "HTML dog:\n\"href! href!\"",
    "Roses are red, violets are blue,\nI love TypeScript, and so should you.",
    "Roses are red, violets are blue,\nunexpected '{' on line 22",
    "I wrote a book about prop drilling, but it was too deep to publish.",
    "What's the difference between a React component and theatre?\nIn theatre, if a prop is missing, they can improvise.",
    "Why did the React component break up with its state?\nIt couldn't handle the changes.",
    "Drink water, you don't want to have a HydrationError!",
    "[object Object]\n\nJust kidding. It's a string.",
    "Functional components are just less classy.",
    "const captain_hook = usePirate();",
    "Is this your card?\nNo? Check in node_modules.",
    "Why did the component list take so long to get to work?\nIt lost its keys.",
    "Ask your doctor if React is right for you. Side effects may include:\ncomponentDidMount, componentDidUpdate, componentWillUnmount, and death.",
    "I promise I'll a-wait for you.",
    "Backend JS developers, don't forget to express yourself.",
    "My parents always told me I could be anything I wanted to be.\nThen I started programming, and ESLint immediately informed me that\nany was not a permitted type.",
    "In JavaScript, you find out your mistakes when you run the code.\nIn TypeScript, you find out immediately, along with a detailed essay\nto explain why you should have known better.",
    "Mutable data is an anti-pattern.\nUse the const const const keyword to make a constant constant constant."
];

interface DevToolsChoiceProps {
    href: string;
    title: string;
    description?: string;
    IconComponent: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

/**
 * A card component for a DevTools choice.
 * @param href the URL to navigate to when the card is clicked
 * @param title the title of the card
 * @param description an optional description of the card
 * @param IconComponent the icon component to display in the card
 * @returns the element
 */
const DevToolsChoice = ({href, title, description, IconComponent}: DevToolsChoiceProps) => {
    return (
        <div className="card flex flex-col h-80 w-55 pt-10 pb-3 bg-base-200 shadow-xl">
            <figure>
                <IconComponent className="w-16 h-16 text-primary" />
            </figure>
            <div className="card-body flex flex-col items-center justify-between">
                <div className="flex flex-col items-center gap-2">
                    <h2 className="card-title">{title}</h2>
                    <span className="text-center text-balance">{description || ""}</span>
                </div>

                <div className="w-full flex flex-col items-center">
                    <div className="divider m-2" />
                    <Link href={href} className="btn btn-primary w-7/10">Go!</Link>
                </div>
            </div>
        </div>
    );
}

export const DevToolsPage = () => {
    const splash = SPLASH_TEXTS[Math.floor(Math.random() * SPLASH_TEXTS.length)];

    return (
        <div className="h-full w-full flex flex-col gap-4">
            <h1 className="text-2xl font-bold">DevTools</h1>

            <div className="flex flex-col items-center justify-between my-11 flex-1">
                <div className="flex flex-wrap gap-6 items-center justify-center">
                    <DevToolsChoice href="/devtools/plugins" title="Plugins" description="Let's check your work before you show the class." IconComponent={ToyBrick} />
                    <DevToolsChoice href="/devtools/logs" title="Logs" description="Where your code goes to confess..." IconComponent={Logs} />
                    <DevToolsChoice href="/devtools/websocket" title="WebSocket Tester" description="Like texting, except you actually get a reply!" IconComponent={Cable} />
                </div>

                <p className="text-center w-full font-bold whitespace-pre-line text-balance">
                    {splash}
                </p>
            </div>
        </div>
    );
}
