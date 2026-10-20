interface CustomIcon {
    name: string;
    src: string;
    tags: string[];
}

export const CUSTOM_ICONS: CustomIcon[] = [
    {name: "pi-tray", src: `${import.meta.env.BASE_URL}icon.svg`, tags: ["logo", "raspberry", "pi"]},
];

export const CUSTOM_ICON_MAP: Map<string, CustomIcon> = new Map(CUSTOM_ICONS.map(icon => [icon.name, icon]));
