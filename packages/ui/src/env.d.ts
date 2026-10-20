declare module "*.module.css" {
    const classes: Record<string, string>;
    export default classes;
}

// set by vite in whichever app imports this package
interface ImportMeta {
    readonly env: {readonly BASE_URL: string};
}
