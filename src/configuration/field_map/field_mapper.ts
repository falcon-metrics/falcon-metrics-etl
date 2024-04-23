export abstract class FieldMapper {
    private nextMapper?: FieldMapper;

    setNext(nextMapper: FieldMapper): FieldMapper {
        this.nextMapper = nextMapper;

        return nextMapper;
    }

    map(
        source: unknown,
        destination: unknown,
        conditionsSource?: unknown,
    ): void {
        this.executeMap(source, destination, conditionsSource);

        if (this.nextMapper)
            this.nextMapper.map(source, destination, conditionsSource);
    }

    protected abstract executeMap(
        source: unknown,
        destination: unknown,
        conditionSource?: unknown,
    ): void;
}

export class DoNothingFieldMapper extends FieldMapper {
    protected executeMap(): void {
        // do nothing
    }
}

export class AllConditionsTrueFieldMapper extends FieldMapper {
    private conditions: Array<IFieldCondition>;
    private sourceFieldName: string;
    private destFieldName: string;

    constructor(opts: {
        conditions: Array<IFieldCondition>;
        sourceFieldName: string;
        destFieldName: string;
    }) {
        super();

        if (opts.sourceFieldName === '')
            throw new Error('Source Field name is mandatory');
        if (opts.destFieldName === '')
            throw new Error('Destination Field name is mandatory');

        this.conditions = opts.conditions;
        this.sourceFieldName = opts.sourceFieldName;
        this.destFieldName = opts.destFieldName;
    }

    protected executeMap(
        source: unknown,
        destination: unknown,
        conditionsSource?: unknown,
    ): void {
        if (this.conditions.length < 1) return;

        if (
            !this.conditions.every((condition) =>
                condition.evaluate(conditionsSource),
            )
        )
            return;

        (destination as any)[this.destFieldName] = (source as any)[ // eslint-disable-line
            this.sourceFieldName
        ];
    }
}

export interface IFieldCondition {
    evaluate(sourceObject: unknown): boolean;
}

export class FieldContainsExactStringCondition implements IFieldCondition {
    private fieldName: string;
    private fieldValue: string;

    constructor(fieldName: string, fieldValue: string) {
        if (fieldName === '') throw new Error('Field name is mandatory');

        this.fieldName = fieldName;
        this.fieldValue = fieldValue;
    }

    evaluate(sourceObject: unknown): boolean {
        if (!Object.getOwnPropertyNames(sourceObject).includes(this.fieldName))
            return false;

        const obj: any = sourceObject; // eslint-disable-line

        if (typeof obj[this.fieldName] !== 'string') return false;

        return obj[this.fieldName] === this.fieldValue;
    }
}
