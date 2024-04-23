import {
    FieldContainsExactStringCondition,
    AllConditionsTrueFieldMapper,
    IFieldCondition,
} from './field_mapper';
import { mock } from 'jest-mock-extended';

describe(`${FieldContainsExactStringCondition.prototype.evaluate.name} tests`, () => {
    const sourceObject = {
        fieldA: 'a value',
        fieldB: 7,
        'field-c': 'another value',
        'field d': { a: 1, b: 'hello' },
    };

    test('When no field name provided Throw exception', () => {
        try {
            new FieldContainsExactStringCondition('', 'a value');
        } catch (e) {
            expect(e.message).toMatch(/.* name .* mandatory.*/);
            return;
        }

        fail('Call should have thrown an error');
    });

    test('When field not in test object Return false', () => {
        const fieldName = 'non-existant field';
        const fieldValue = 'doesnt matter';

        const fcesc = new FieldContainsExactStringCondition(
            fieldName,
            fieldValue,
        );

        expect(fcesc.evaluate(sourceObject)).toBe(false);
    });

    test.each([
        ['fieldB', '7'],
        ['field d', 'hello'],
    ])(
        'When field value not string Return false',
        (fieldName: string, fieldValue: string) => {
            const fcesc = new FieldContainsExactStringCondition(
                fieldName,
                fieldValue,
            );

            expect(fcesc.evaluate(sourceObject)).toBe(false);
        },
    );

    test.each([
        ['fieldA', 'not the same'],
        ['fieldA', 'A Value'],
        ['fieldA', 'a value  '],
        ['field-c', 'hello'],
    ])(
        'When field value not same Return false',
        (fieldName: string, fieldValue: string) => {
            const fcesc = new FieldContainsExactStringCondition(
                fieldName,
                fieldValue,
            );

            expect(fcesc.evaluate(sourceObject)).toBe(false);
        },
    );

    test.each([
        ['fieldA', 'a value'],
        ['field-c', 'another value'],
    ])(
        'When field value same Return true',
        (fieldName: string, fieldValue: string) => {
            const fcesc = new FieldContainsExactStringCondition(
                fieldName,
                fieldValue,
            );

            expect(fcesc.evaluate(sourceObject)).toBe(true);
        },
    );
});

describe(`${AllConditionsTrueFieldMapper.prototype.map.name} tests`, () => {
    test('When source field name not provided Throw error', () => {
        try {
            new AllConditionsTrueFieldMapper({
                sourceFieldName: '',
                destFieldName: 'a value',
                conditions: [],
            });
        } catch (e) {
            expect(e.message).toMatch(/.*source.* name .* mandatory.*/i);
            return;
        }
        fail('Call should have thrown an error');
    });

    test('When destination field name not provided Throw error', () => {
        try {
            new AllConditionsTrueFieldMapper({
                sourceFieldName: 'a value',
                destFieldName: '',
                conditions: [],
            });
        } catch (e) {
            expect(e.message).toMatch(/.*dest.* name .* mandatory.*/i);
            return;
        }
        fail('Call should have thrown an error');
    });

    test('When all conditions true Then map value to field', () => {
        const sourceName = 'sourceField';
        const destName = 'destField';

        const source = {
            sourceField: 'source Value',
            anotherField: 'whatever',
        };

        const dest = {
            destField: 'original value',
            anotherField: 'doesnt matter',
        };

        const conditions = [true, true, true].map((result) => {
            const condition = mock<IFieldCondition>();
            condition.evaluate.mockReturnValue(result);
            return condition;
        });

        const actfm = new AllConditionsTrueFieldMapper({
            conditions: conditions,
            destFieldName: destName,
            sourceFieldName: sourceName,
        });

        actfm.map(source, dest);

        expect(dest.anotherField).toBe('doesnt matter');
        expect(dest.destField).toBe('source Value');
    });

    test('When all conditions true and dest field not present Then create field and map value to field', () => {
        const sourceName = 'sourceField';
        const destName = 'destField';

        const source = {
            sourceField: 'source Value',
            anotherField: 'whatever',
        };

        const dest = {
            anotherField: 'doesnt matter',
        };

        const conditions = [true, true, true].map((result) => {
            const condition = mock<IFieldCondition>();
            condition.evaluate.mockReturnValue(result);
            return condition;
        });

        const actfm = new AllConditionsTrueFieldMapper({
            conditions: conditions,
            destFieldName: destName,
            sourceFieldName: sourceName,
        });

        actfm.map(source, dest);

        expect(dest.anotherField).toBe('doesnt matter');
        expect(dest).toHaveProperty(destName, 'source Value');
    });

    test('When a condition false Then value is not mapped', () => {
        const sourceName = 'sourceField';
        const destName = 'destField';

        const source = {
            sourceField: 'source Value',
            anotherField: 'whatever',
        };

        const dest = {
            destField: 'original value',
            anotherField: 'doesnt matter',
        };

        const conditions = [true, false, true].map((result) => {
            const condition = mock<IFieldCondition>();
            condition.evaluate.mockReturnValue(result);
            return condition;
        });

        const actfm = new AllConditionsTrueFieldMapper({
            conditions: conditions,
            destFieldName: destName,
            sourceFieldName: sourceName,
        });

        actfm.map(source, dest);

        expect(dest.anotherField).toBe('doesnt matter');
        expect(dest.destField).toBe('original value');
    });

    test('When no conditions Then value is not mapped', () => {
        const sourceName = 'sourceField';
        const destName = 'destField';

        const source = {
            sourceField: 'source Value',
            anotherField: 'whatever',
        };

        const dest = {
            destField: 'original value',
            anotherField: 'doesnt matter',
        };

        const conditions = [].map((result) => {
            const condition = mock<IFieldCondition>();
            condition.evaluate.mockReturnValue(result);
            return condition;
        });

        const actfm = new AllConditionsTrueFieldMapper({
            conditions: conditions,
            destFieldName: destName,
            sourceFieldName: sourceName,
        });

        actfm.map(source, dest);

        expect(dest.anotherField).toBe('doesnt matter');
        expect(dest.destField).toBe('original value');
    });
});
