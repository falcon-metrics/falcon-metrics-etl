import btoa from 'btoa';
export const setupHeaders = (accessCredentials: string) => {
    return {
        Authorization: 'Basic '.concat(btoa(accessCredentials)),
        //these language headings are here because otherwise Jira provides inconsistent
        //response for issue type names, sometimes in english, sometimes in local language
        //so we're forcing it to always return in english
        'Accept-Language': 'en',
        'X-Force-Accept-Language': 'true',
    };
};