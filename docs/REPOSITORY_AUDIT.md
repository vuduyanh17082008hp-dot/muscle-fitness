# AI and Technology Disclosure

## Groq

Purpose:

Runtime inference provider for Dante.

Runtime:

Yes when `GROQ_API_KEY` is configured.

The exact production model must be verified from `GROQ_MODEL`
before submission.

## Supabase

Purpose:

- authentication
- user profiles
- database
- Row Level Security

Runtime:

Yes.

## Vercel

Purpose:

Production deployment.

Runtime:

Yes for the competition deployment.

## PubMed / NCBI

Purpose:

Scientific research retrieval.

Only describe PubMed as used at runtime if the deployed Dante API
actually retrieves NCBI data.

## USDA FoodData Central

Purpose:

Food and nutrient information.

Only claim runtime use when the API is actually connected.

## Open Food Facts

Purpose:

Packaged food information.

License and attribution requirements should be verified before
submission.

## wger

Purpose:

Exercise and workout data.

License and attribution requirements should be verified before
submission.

## PubChem

Purpose:

Compound information.

Only list as runtime if the deployed code calls PubChem.

## openFDA

Purpose:

Supporting drug-label and safety information.

openFDA information must not be interpreted as clinical diagnosis.

## Development Tools

### Cursor

Used as an AI-assisted development environment.

### ChatGPT / OpenAI

Used during development for:

- architecture
- debugging
- code assistance
- copy
- product planning

Development-tool usage does not necessarily mean that the same
model or provider is used at runtime.

## Media Disclosure

The inspirational fitness story used on the website is original
composite copy.

It is not presented as a real Muscle Fitness client testimonial.

Third-party stories were used only as thematic inspiration.

## Before Submission

Verify:

- production AI model
- active APIs
- licenses
- media permissions
- GitHub visibility
- no secrets in Git history