import {createContext, useContext} from "react";

/**
 * The page the grid editor is showing, so the buttons and dialogs inside it read and write that page's cells.
 */
export const EditingPageContext = createContext<string | null>(null);

/**
 * The id of the page being edited.
 * @throws outside an EditingPageContext provider
 */
export const useEditingPage = (): string => {
    const page_id = useContext(EditingPageContext);

    if (page_id === null) {
        throw new Error("useEditingPage must be used inside an EditingPageContext provider");
    }

    return page_id;
}
