// https://coderwall.com/p/_g3x9q/how-to-check-if-javascript-object-is-empty
export function isEmpty(obj: any | undefined): boolean { // eslint-disable-line
    if (!obj) return true;

    for (const key in obj) {
        // https://eslint.org/docs/rules/no-prototype-builtins
        if (Object.prototype.hasOwnProperty.call(obj, key)) return false;
    }

    return true;
}

/**
 * Change all undefined values to null
 *
 *
 * when we perform the upsert via sequelize, undefined values are ignored, but null values get set to null
 * this means that a column with a value in the database, which is now undefined, does not get set to null
 * in the database as it should. to work around this, we need to set undefined fields to null,
 * as sequelize will correctly set them to null in the database
 */
export const changeUndefinedToNull = (obj: Record<string, any>) => {
    Object.entries(obj).forEach(([key, value]) => {
        if (value === undefined) {
            obj[key] = null;
        }
    });
};
