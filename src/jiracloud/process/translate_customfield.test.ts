import { mock } from 'jest-mock-extended';

import { translateCustomField } from './translate_customfield';

describe(`custom field tests`, () => {
    test('has value field', () => {

        const fields = {
            customfield_10031: {
                self: "https://example.atlassian.net/rest/api/3/customFieldOption/10028",
                value: "Value Demand",
                id: "10028",
            },

        };

        const datasourceFieldName = 'customfield_10031';
        const displayName = 'Value Demand';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual).toEqual([{
            displayName,
            datasourceFieldName,
            datasourceFieldValue: 'Value Demand',
            type
        }]);

    });


});

describe('custom field is null', () => {
    test('custom field is null', () => {
        const fields = {
            "customfield_001": null
        };
        const datasourceFieldName = 'customfield_001';
        const displayName = 'customfield_001';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual).toEqual([{
            datasourceFieldName,
            displayName,
            type,
            datasourceFieldValue: 'null',
        }]);
    });

    test('custom field does not exist on the issue', () => {
        const fields = {
            "customfield_001": null
        };
        const datasourceFieldName = 'customfield_002';
        const displayName = 'customfield_002';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual).toEqual([]);
    });

});

describe('custom field is an object', () => {
    // TODO: Actual examples of jira issues would be much better

    test('object has the name property', () => {
        // Custom fields will have only one of the following properties. 
        // Adding multiple properties to this object to test precedence
        const fields = {
            "customfield_001": {
                name: 'test_name',
                value: 'test_value',
                displayName: 'test_displayName',
                key: 'test_key'
            }
        };
        const datasourceFieldName = 'customfield_001';
        const displayName = 'customfield_001';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual.length).toBe(1);
        expect(actual[0].datasourceFieldValue).toBe(fields.customfield_001.name);
        expect(actual[0].datasourceFieldName).toBe(datasourceFieldName);
        expect(actual[0].type).toBe(type);
    });
    test('object has the value property', () => {
        // Custom fields will have only one of the following properties. 
        // Adding multiple properties to this object to test precedence
        const fields = {
            "customfield_001": {
                value: 'test_value',
                displayName: 'test_displayName',
                key: 'test_key'
            }
        };
        const datasourceFieldName = 'customfield_001';
        const displayName = 'customfield_001';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual.length).toBe(1);
        expect(actual[0].datasourceFieldValue).toBe(fields.customfield_001.value);
        expect(actual[0].datasourceFieldName).toBe(datasourceFieldName);
        expect(actual[0].type).toBe(type);
    });
    test('object has the displayName property', () => {
        // Custom fields will have only one of the following properties. 
        // Adding multiple properties to this object to test precedence
        const fields = {
            "customfield_001": {
                displayName: 'test_displayName',
                key: 'test_key'
            }
        };
        const datasourceFieldName = 'customfield_001';
        const displayName = 'customfield_001';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual.length).toBe(1);
        expect(actual[0].datasourceFieldValue).toBe(fields.customfield_001.displayName);
        expect(actual[0].datasourceFieldName).toBe(datasourceFieldName);
        expect(actual[0].type).toBe(type);
    });
    test('object has the key property', () => {
        // Custom fields will have only one of the following properties. 
        // Adding multiple properties to this object to test precedence
        const fields = {
            "customfield_001": {
                key: 'test_key'
            }
        };
        const datasourceFieldName = 'customfield_001';
        const displayName = 'customfield_001';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual.length).toBe(1);
        expect(actual[0].datasourceFieldValue).toBe(fields.customfield_001.key);
        expect(actual[0].datasourceFieldName).toBe(datasourceFieldName);
        expect(actual[0].type).toBe(type);
    });
});
describe(`custom field is an array`, () => {
    test('array of strings', () => {
        const fields = {
            "labels": [
                "Globo",
                "Obeya_Stability_2022",
                "Woolworth"
            ],
        };

        const datasourceFieldName = 'labels';
        const displayName = 'labels_displayName';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual.length).toEqual(3);
        expect(actual.map(cf => cf.datasourceFieldValue)).toEqual(fields.labels);
        expect(actual.map(cf => cf.datasourceFieldName)).toEqual(actual.map(_ => datasourceFieldName));
        expect(actual.map(cf => cf.displayName)).toEqual(actual.map(_ => displayName));
        expect(actual.map(cf => cf.type)).toEqual(actual.map(_ => type));
    });
    test('array of objects with value property', () => {
        const fields = {
            "labels": [
                { value: "Globo" },
                { value: "Obeya_Stability_2022" },
                { value: "Woolworth" }
            ],
        };

        const datasourceFieldName = 'labels';
        const displayName = 'labels_displayName';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual.length).toEqual(3);
        expect(actual.map(cf => cf.datasourceFieldValue)).toEqual(fields.labels.map(cf => cf.value));
        expect(actual.map(cf => cf.datasourceFieldName)).toEqual(actual.map(_ => datasourceFieldName));
        expect(actual.map(cf => cf.displayName)).toEqual(actual.map(_ => displayName));
        expect(actual.map(cf => cf.type)).toEqual(actual.map(_ => type));

    });
    test('array of objects with name property', () => {
        const fields = {
            "labels": [
                { name: "Globo" },
                { name: "Obeya_Stability_2022" },
                { name: "Woolworth" }
            ],
        };

        const datasourceFieldName = 'labels';
        const displayName = 'labels_displayName';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual.length).toEqual(3);
        expect(actual.map(cf => cf.datasourceFieldValue)).toEqual(fields.labels.map(cf => cf.name));
        expect(actual.map(cf => cf.datasourceFieldName)).toEqual(actual.map(_ => datasourceFieldName));
        expect(actual.map(cf => cf.displayName)).toEqual(actual.map(_ => displayName));
        expect(actual.map(cf => cf.type)).toEqual(actual.map(_ => type));

    });
    test('array of objects of unknown type', () => {
        const fields = {
            "labels": [
                { unknown: "Globo" },
                { unknown: "Obeya_Stability_2022" },
                { unknown: "Woolworth" }
            ],
        };

        const datasourceFieldName = 'labels';
        const displayName = 'labels_displayName';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual.length).toEqual(3);
        expect(actual.map(cf => cf.datasourceFieldValue)).toEqual(fields.labels.map(cf => JSON.stringify(cf)));
        expect(actual.map(cf => cf.datasourceFieldName)).toEqual(actual.map(_ => datasourceFieldName));
        expect(actual.map(cf => cf.displayName)).toEqual(actual.map(_ => displayName));
        expect(actual.map(cf => cf.type)).toEqual(actual.map(_ => type));

    });
});
describe(`custom field is a string, number or boolean`, () => {
    test('custom field is a string', () => {
        const fields = {
            "label": 'test_label'
        };

        const datasourceFieldName = 'label';
        const displayName = 'label_displayName';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual.length).toEqual(1);
        expect(actual[0].displayName).toEqual(displayName);
        expect(actual[0].datasourceFieldValue).toEqual(fields.label);
        expect(actual[0].datasourceFieldName).toEqual(datasourceFieldName);
        expect(actual[0].type).toEqual(type);
    });
    test('custom field is a number', () => {
        const fields = {
            "label": 100
        };

        const datasourceFieldName = 'label';
        const displayName = 'label_displayName';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual.length).toEqual(1);
        expect(actual[0].displayName).toEqual(displayName);
        expect(actual[0].datasourceFieldValue).toEqual(fields.label);
        expect(actual[0].datasourceFieldName).toEqual(datasourceFieldName);
        expect(actual[0].type).toEqual(type);
    });
    test('custom field is a boolean', () => {
        const fields = {
            "label": false
        };

        const datasourceFieldName = 'label';
        const displayName = 'label_displayName';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual.length).toEqual(1);
        expect(actual[0].displayName).toEqual(displayName);
        expect(actual[0].datasourceFieldValue).toEqual(fields.label);
        expect(actual[0].datasourceFieldName).toEqual(datasourceFieldName);
        expect(actual[0].type).toEqual(type);
    });
});

describe(`custom field is of unknown type`, () => {
    test('custom field is of unknown type but the name doesnt have the prefix customfield', () => {
        const fields = {
            "label": {
                'test_1': 100,
                'test_2': 120
            }
        };

        const datasourceFieldName = 'label';
        const displayName = 'label_displayName';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual.length).toEqual(0);
        expect(actual).toEqual([]);
    });
    test('custom field is of unknown type and the name as the prefix customfield', () => {
        const fields = {
            "customfield_label": {
                'test_1': 100,
                'test_2': 120
            }
        };

        const datasourceFieldName = 'customfield_label';
        const displayName = 'label_displayName';
        const type = 'system';

        const actual = translateCustomField(
            fields,
            datasourceFieldName,
            displayName,
            type
        );

        expect(actual.length).toEqual(1);
        expect(actual[0].displayName).toEqual(displayName);
        expect(actual[0].datasourceFieldValue).toEqual(JSON.stringify(fields.customfield_label));
        expect(actual[0].datasourceFieldName).toEqual(datasourceFieldName);
        expect(actual[0].type).toEqual(type);
    });
});
