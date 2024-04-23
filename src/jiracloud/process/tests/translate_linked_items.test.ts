import * as FLO1331 from './FLO-1331.json';
import * as FLO1370 from './FLO-1370.json';
import * as FLO1386 from './FLO-1386.json';
import { FlomatikaItemLinkType, LinkedItem } from "../../../workitem/interfaces";
import { translateJiraLinkedItems } from '../translate_linked_items';

test('should translate blocked by/cloned by', async () => {

    const expected: Array<LinkedItem> = [
        {
            type: 'is blocked by',
            workItemId: 'FLO-1370',
        },
        {
            type: 'is cloned by',
            workItemId: 'FLO-1386',
        },
    ];

    const actual = translateJiraLinkedItems(FLO1331);

    expect(actual).toEqual(
        expect.arrayContaining(expected)
    );

});

test('should translate clones/relates to', async () => {

    const expected: Array<LinkedItem> = [
        // {
        //     type: FlomatikaItemLinkType.CLONES,
        //     workItemId: 'FLO-1331',
        // },
        {
            type: 'relates to',
            workItemId: 'FLO-1370',
        }
    ];

    const actual = translateJiraLinkedItems(FLO1386);

    expect(actual).toEqual(
        expect.arrayContaining(expected)
    );

});

test('should translate blocks/relates to', async () => {

    const expected: Array<LinkedItem> = [
        {
            type: FlomatikaItemLinkType.BLOCKS,
            workItemId: 'FLO-1331',
        },
        {
            type: FlomatikaItemLinkType.BLOCKS,
            workItemId: 'FLO-1330',
        },
        {
            type: 'relates to',
            workItemId: 'FLO-1386',
        }
    ];

    const actual = translateJiraLinkedItems(FLO1370);

    expect(actual).toEqual(
        expect.arrayContaining(expected)
    );

});