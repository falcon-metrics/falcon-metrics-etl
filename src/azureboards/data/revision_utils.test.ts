import { getBlockedRevisions, getAssigneeChangeRevisions, getCustomFieldRevisions } from './revision_utils';
const allRevisions1 = [
    {
        "WorkItemId": 7205,
        "Revision": 1,
        "State": "New",
        "Blocked": null
    },
    {
        "WorkItemId": 7205,
        "Revision": 2,
        "State": "Pool of Options",
        "Blocked": null
    },
    {
        "WorkItemId": 7205,
        "Revision": 3,
        "State": "Next",
        "Blocked": null
    },
    {
        "WorkItemId": 7205,
        "Revision": 4,
        "State": "Next",
        "Blocked": null
    },
    {
        "WorkItemId": 7205,
        "Revision": 5,
        "State": "Next",
        "Blocked": null
    },
    {
        "WorkItemId": 7205,
        "Revision": 6,
        "State": "Custom Todo",
        "Blocked": null
    },
    {
        "WorkItemId": 7205,
        "Revision": 7,
        "State": "Custom Todo",
        "Blocked": "Yes"
    },
    {
        "WorkItemId": 7205,
        "Revision": 8,
        "State": "Custom Todo",
        "Blocked": "No"
    },
    {
        "WorkItemId": 7205,
        "Revision": 9,
        "State": "Custom Todo",
        "Blocked": "Yes"
    },
    {
        "WorkItemId": 7205,
        "Revision": 10,
        "State": "Custom Todo",
        "Blocked": "Yes"
    },
    {
        "WorkItemId": 7205,
        "Revision": 11,
        "State": "Custom Todo",
        "Blocked": "No"
    },
    {
        "WorkItemId": 7205,
        "Revision": 12,
        "State": "Custom Todo",
        "Blocked": "No"
    }
];
const blockedFieldName = 'Blocked';
describe('Test blocked revisions', () => {
    const blockedRevisions = getBlockedRevisions(allRevisions1, blockedFieldName);
    test('First revision is blocked', () => {
        expect(blockedRevisions[0].flagged).toBe(true);
    });
    test('First revision is 7', () => {
        expect(blockedRevisions[0].Revision).toBe(7);
    });
});



const allRevisions2 = [
    {
        "WorkItemId": 7205,
        "Revision": 1,
        "State": "New",
        "Blocked": "No"
    },
    {
        "WorkItemId": 7205,
        "Revision": 2,
        "State": "Pool of Options",
        "Blocked": null
    },
    {
        "WorkItemId": 7205,
        "Revision": 3,
        "State": "Next",
        "Blocked": null
    },
    {
        "WorkItemId": 7205,
        "Revision": 4,
        "State": "Next",
        "Blocked": null
    },
    {
        "WorkItemId": 7205,
        "Revision": 5,
        "State": "Next",
        "Blocked": null
    },
    {
        "WorkItemId": 7205,
        "Revision": 6,
        "State": "Custom Todo",
        "Blocked": null
    },
    {
        "WorkItemId": 7205,
        "Revision": 8,
        "State": "Custom Todo",
        "Blocked": "No"
    },
];
describe('Test no blocked revisions', () => {
    const blockedRevisions = getBlockedRevisions(allRevisions2, blockedFieldName);
    test('No blocked revisions', () => {
        expect(blockedRevisions.length).toBe(0);
    });
});


const allRevisions3 = [
    {
        "WorkItemId": 7205,
        "Revision": 1,
        "State": "New",
        "Blocked": null,
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 2,
        "State": "Pool of Options",
        "Blocked": null,
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 3,
        "State": "Next",
        "Blocked": null,
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 4,
        "State": "Next",
        "Blocked": null,
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 5,
        "State": "Next",
        "Blocked": null,
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 6,
        "State": "Custom Todo",
        "Blocked": null,
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 7,
        "State": "Custom Todo",
        "Blocked": "Yes",
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 8,
        "State": "Custom Todo",
        "Blocked": "No",
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 9,
        "State": "Custom Todo",
        "Blocked": "Yes",
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 10,
        "State": "Custom Todo",
        "Blocked": "Yes",
        "AssignedTo": {
            "UserName": "Marco"
        },
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 11,
        "State": "Custom Todo",
        "Blocked": "No",
        "AssignedTo": {
            "UserName": "Shishir"
        },
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 12,
        "State": "Custom Todo",
        "Blocked": "No",
        "AssignedTo": {
            "UserName": "Marco"
        },
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    }
];
describe('Test assignee changes', () => {
    test('Test assignee changes', () => {
        const assigneeRevisions = getAssigneeChangeRevisions(allRevisions3);
        expect(assigneeRevisions.length).toBe(4);
    });
});


const allRevisions4 = [
    {
        "WorkItemId": 7205,
        "Revision": 1,
        "State": "New",
        "Blocked": null,
        "Custom_BlockedReason": null,
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 2,
        "State": "Pool of Options",
        "Blocked": null,
        "Custom_BlockedReason": null,
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 3,
        "State": "Next",
        "Blocked": null,
        "Custom_BlockedReason": null,
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 4,
        "State": "Next",
        "Blocked": null,
        "Custom_BlockedReason": null,
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 5,
        "State": "Next",
        "Blocked": null,
        "Custom_BlockedReason": null,
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 6,
        "State": "Custom Todo",
        "Blocked": null,
        "Custom_BlockedReason": null,
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 7,
        "State": "Custom Todo",
        "Blocked": "Yes",
        "Custom_BlockedReason": null,
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 8,
        "State": "Custom Todo",
        "Blocked": "No",
        "Custom_BlockedReason": null,
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 9,
        "State": "Custom Todo",
        "Blocked": "Yes",
        "Custom_BlockedReason": null,
        "AssignedTo": null,
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 10,
        "State": "Custom Todo",
        "Blocked": "Yes",
        "Custom_BlockedReason": null,
        "AssignedTo": {
            "UserName": "Marco"
        },
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 11,
        "State": "Custom Todo",
        "Blocked": "No",
        "Custom_BlockedReason": null,
        "AssignedTo": {
            "UserName": "Shishir"
        },
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 12,
        "State": "Custom Todo",
        "Blocked": "No",
        "Custom_BlockedReason": null,
        "AssignedTo": {
            "UserName": "Marco"
        },
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 13,
        "State": "Custom Todo",
        "Blocked": "No",
        "Custom_BlockedReason": "Internal Dependency",
        "AssignedTo": {
            "UserName": "Marco"
        },
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 14,
        "State": "Custom Todo",
        "Blocked": "No",
        "Custom_BlockedReason": "External Dependency",
        "AssignedTo": {
            "UserName": "Marco"
        },
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    },
    {
        "WorkItemId": 7205,
        "Revision": 15,
        "State": "Custom Todo",
        "Blocked": "No",
        "Custom_BlockedReason": null,
        "AssignedTo": {
            "UserName": "Marco"
        },
        "Project": {
            "ProjectId": "8223e21c-c9f2-420c-8bc4-a9778c6739f0",
            "ProjectName": "main"
        }
    }
];
describe('Test blocked/discarded reason changes', () => {
    const blockedReasonFieldName = 'Custom_BlockedReason';
    const revisions = getCustomFieldRevisions(allRevisions4, blockedReasonFieldName);
    test('Test blocked/discarded reason changes', () => {
        expect(revisions.length).toBe(2);
    });
    test('Internal dependency', () => {
        expect(revisions[0][blockedReasonFieldName]).toBe('Internal Dependency');
    });
    test('External dependency', () => {
        expect(revisions[1][blockedReasonFieldName]).toBe('External Dependency');
    });
});