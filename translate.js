import axios from 'axios';
import { GraphQLClient, gql } from 'graphql-request';

const jwtToken = 'jwt_token_here'; // Replace with your actual JWT token
// Note: Ensure you have the correct JWT token with permissions to access the GraphQL API
// Rreplace 'https://your-api-url/graphql' with the actual URL of your GraphQL API.
// If your Graphql endpoint needs authentication, you need to authenticate.
// If you don't have the PaginationInput and UpdateCastMemberInput types, you need to define them according to your GraphQL schema.


// GraphQL setup
const graphQLClient = new GraphQLClient('https://your-api-url/graphql', {
  headers: {
    Authorization: `Bearer ${jwtToken}`
  }
});

// 👉 Query for cast members with pagination
const fetchCastQuery = gql`
  query AdminCastMemberList($paginationInput: PaginationInput!) {
    adminCastMemberList(paginationInput: $paginationInput) {
      castMembers {
        id
        biography
      }
    }
  }
`;

// 👉 Mutation to update cast member
const updateMutation = gql`
  mutation AdminUpdateCastMember($input: UpdateCastMemberInput!) {
    adminUpdateCastMember(input: $input) {
      id
      biography
    }
  }
`;

// 🏴‍☠️ Check if text is Persian
function isPersian(text) {
  const persianChars = text.match(/[\u0600-\u06FF]/g);
  return persianChars && persianChars.length > text.length * 0.1; // 30% or more Persian
}

// 🌐 Translation function using external API
async function translate(text, source = 'en', target = 'fa') {
  try {
    const res = await axios.post('http://localhost:5000/translate', {
      q: text,
      source,
      target,
      format: 'text',
    });
    return res.data.translatedText;
  } catch (error) {
    console.error('Translation error:', error.response?.data || error.message);
    return '';
  }
}

// 💤 Wait helper
const delay = (ms) => new Promise((res) => setTimeout(res, ms));


const MAX_BIO_LENGTH = 1450;

// ✂️ Trims at last full sentence (last `.`) before max length
function trimToLastFullSentence(text, maxLength) {
  if (text.length <= maxLength) return text;

  const cutIndex = text.lastIndexOf('.', maxLength);
  if (cutIndex === -1) return text.slice(0, maxLength).trim(); // fallback
  return text.slice(0, cutIndex + 1).trim(); // include the dot
}

// 🔁 Main loop
async function run() {
  const pageSize = 20;
  let page = 14; // changable to resume from any page
  let pagesProcessed = 0;

  while (true) {
    console.log(`📄 Fetching page ${page}...`);
    const queryVariables = { paginationInput: { pageSize, page } };

    let data;
    try {
      data = await graphQLClient.request(fetchCastQuery, queryVariables);
    } catch (err) {
      console.error(`❌ Failed to fetch page ${page}:`, err.message);
      break;
    }

    const castMembers = data.adminCastMemberList.castMembers;

    if (!castMembers || castMembers.length === 0) {
      console.log('✅ No more cast members to process.');
      break;
    }

    for (const member of castMembers) {
      const bio = member.biography;
      if (!bio || isPersian(bio)) {
        console.log(`⏭️ Skipping ID ${member.id} (empty or Persian)`);
        continue;
      }

      console.log(`🔄 Translating ID: ${member.id}`);
      const translatedBio = await translate(bio);

      if (!translatedBio) {
        console.warn(`⚠️ Skipped update for ID ${member.id} due to translation failure`);
        continue;
      }

      // ✂️ Trim long biographies to last full sentence within limit
      const finalBio = translatedBio.length > MAX_BIO_LENGTH
        ? trimToLastFullSentence(translatedBio, MAX_BIO_LENGTH)
        : translatedBio;

      const updateVariables = {
        input: {
          castMemberId: member.id,
          biography: finalBio,
        },
      };

      try {
        const result = await graphQLClient.request(updateMutation, updateVariables);
        console.log(`✅ Updated ID ${result.adminUpdateCastMember.id}`);
      } catch (err) {
        console.error(`❌ Failed to update ID ${member.id}:`, err.message);
      }
    }

    page++;
    pagesProcessed++;

    // ⏱️ Wait after every 3 pages
    if (pagesProcessed % 3 === 0) {
      console.log(`🕒 Waiting 3 seconds to avoid rate limits...`);
      await delay(3000);
    }
  }

  console.log('🎉 Done processing all pages!');
}

run();
