import { CustomField } from "../../workitem/interfaces";

export const translateCustomField = (
    fields: any,
    datasourceFieldName: string,
    displayName: string,
    type: string,
): Array<CustomField> => {
    if (!(datasourceFieldName in fields)) {
        return [];
    }
    const field: any = fields[datasourceFieldName];

    if (field === null || field === undefined) {
        //just means the custom field value is null which is a valid response
        return [{
            displayName,
            datasourceFieldName,
            datasourceFieldValue: 'null',
            type,
        }];
    }

    const customFields: Array<CustomField> = [];

    if (Array.isArray(field)) {
        for (const fieldItem of field) {
            let fieldValue;
            if (typeof fieldItem === 'string') {
                fieldValue = fieldItem;
            } else if (fieldItem.hasOwnProperty('name')) {
                fieldValue = fieldItem.name;
            } else if (fieldItem.hasOwnProperty('value')) {
                fieldValue = fieldItem.value;
            }
            else {
                fieldValue = JSON.stringify(fieldItem);
            }

            const customField: CustomField = {
                displayName,
                datasourceFieldName,
                datasourceFieldValue: fieldValue,
                type,
            };
            customFields.push(customField);
        }
    } else if (
        typeof field === 'object' &&
        field.hasOwnProperty('name')
    ) {
        const customField = {
            datasourceFieldValue: field.name,
            datasourceFieldName: datasourceFieldName,
            displayName: displayName,
            type: type,
        };
        customFields.push(customField);
    } else if (
        typeof field === 'object' &&
        field.hasOwnProperty('value')
    ) {
        const customField = {
            datasourceFieldValue: field.value,
            datasourceFieldName: datasourceFieldName,
            displayName: displayName,
            type: type,
        };
        customFields.push(customField);
    } else if (
        typeof field === 'object' &&
        field.hasOwnProperty('displayName')
    ) {
        const customField = {
            datasourceFieldValue: field.displayName,
            datasourceFieldName: datasourceFieldName,
            displayName: displayName,
            type: type,
        };
        customFields.push(customField);
    } else if (
        typeof field === 'object' &&
        field.hasOwnProperty('key')
    ) {
        const customField = {
            datasourceFieldValue: field.key,
            datasourceFieldName: datasourceFieldName,
            displayName: displayName,
            type: type,
        };
        customFields.push(customField);
    } else if (
        typeof field === 'string' ||
        typeof field === 'number' ||
        // Adding boolean just in case even though we have not seen boolean fields till now
        typeof field === 'boolean'
    ) {
        const customField: CustomField = {
            displayName,
            datasourceFieldName,
            datasourceFieldValue: field,
            type,
        };
        customFields.push(customField);
    } else if (datasourceFieldName.startsWith('customfield')) {
        const customField: CustomField = {
            displayName,
            datasourceFieldName,
            datasourceFieldValue: JSON.stringify(field),
            type,
        };
        customFields.push(customField);
    }

    return customFields;
};