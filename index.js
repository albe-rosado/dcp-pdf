const {google} = require('googleapis');
cosnt _ = require('lodash');
const GmailAuth = require('./gmail-auth');

GmailAuth('credentials.json', processEmails);




async function processEmails(auth) {
    const Gmail = google.gmail({version: 'v1', auth});
    const messages = await Gmail.users.messages.list({userId: 'me', q: 'from:founders@dailycodingproblem.com'});
    console.log(messages)

}

