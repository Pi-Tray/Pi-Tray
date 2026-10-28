import {createContext, useContext} from "react";

interface EditingPage {
    /** The id of the page the grid editor is showing */
    page_id: string;

    /** Switches the grid editor to another page */
    show_page: (page_id: string) => void;
}

/**
 * The page the grid editor is showing, so the buttons and dialogs inside it read and write that page's cells.
 */
export const EditingPageContext = createContext<EditingPage | null>(null);

const use_editing_page_context = (): EditingPage => {
    const context = useContext(EditingPageContext);

    if (context === null) {
        throw new Error("The editing page hooks must be used inside an EditingPageContext provider");
    }

    return context;
}

/**
 * The id of the page being edited.
 */
export const useEditingPage = (): string => use_editing_page_context().page_id;

/**
 * Switches the grid editor to another page, e.g. from the page switcher or a link cell.
 */
export const useShowEditingPage = (): ((page_id: string) => void) => use_editing_page_context().show_page;
