import { createClient } from "@/lib/supabase/server";
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context";
import {
  TRAINING_MODE_LABELS,
  ACTIVITY_LEVEL_LABELS,
  NUTRITION_GOAL_LABELS,
} from "@/lib/nutrition/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================================================
   TYPES
========================================================= */

type ChatRequestBody = {
  message?: unknown;
  messages?: unknown;
};

type UserContext = {
  profile: unknown;
  fitnessProfile: unknown;
  preferences: unknown;
  currentNutritionPlan: unknown;
};

type Intent = {
  training: boolean;
  nutrition: boolean;
  supplement: boolean;
  health: boolean;
};

type PubMedArticle = {
  pmid: string;
  title: string;
  journal: string;
  published: string;
  abstract: string;
  url: string;
};

type UsdaFood = {
  fdcId: number;
  name: string;
  brand: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  servingSize: number | null;
  servingUnit: string | null;
  url: string;
};

type OpenFoodFactsProduct = {
  code: string;
  name: string;
  brand: string;
  calories100g: number | null;
  protein100g: number | null;
  carbs100g: number | null;
  fat100g: number | null;
  sugars100g: number | null;
  salt100g: number | null;
  url: string;
};

type PubChemResult = {
  compound: string;
  cid: number;
  molecularFormula: string | null;
  molecularWeight: string | number | null;
  url: string;
};

type OpenFdaResult = {
  substance: string;
  purpose: string | null;
  warnings: string[];
  adverseReactions: string[];
  url: string;
};

type EvidenceContext = {
  pubmed: PubMedArticle[];
  usda: UsdaFood[];
  openFoodFacts: OpenFoodFactsProduct[];
  pubchem: PubChemResult | null;
  openFda: OpenFdaResult | null;
};

type GroqApiResponse = {
  choices?: Array<{
    finish_reason?: string | null;

    message?: {
      role?: string;
      content?: string | null;
      reasoning?: unknown;
    };
  }>;

  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };

  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

type DanteResult = {
  reply: string;
  model: string;
};

type SourceItem = {
  type: string;
  title: string;
  url: string;
};

/* =========================================================
   GENERIC HELPERS
========================================================= */

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getString(
  value: unknown,
): string {
  return typeof value === "string"
    ? value
    : "";
}

function getNumber(
  value: unknown,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : null;
}

function decodeXml(
  value: string,
): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replace(
      /<[^>]+>/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function truncate(
  value: string,
  maxLength: number,
): string {
  if (
    value.length <=
    maxLength
  ) {
    return value;
  }

  return `${value.slice(
    0,
    maxLength,
  )}…`;
}

/* =========================================================
   FETCH WITH TIMEOUT
========================================================= */

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => {
        controller.abort();
      },
      timeoutMs,
    );

  try {
    return await fetch(
      url,
      {
        ...init,

        signal:
          controller.signal,
      },
    );
  } finally {
    clearTimeout(
      timer,
    );
  }
}

/* =========================================================
   USER MESSAGE
========================================================= */

function getUserMessage(
  body: unknown,
): string {
  if (!isRecord(body)) {
    return "";
  }

  const requestBody =
    body as ChatRequestBody;

  if (
    typeof requestBody.message ===
    "string"
  ) {
    return requestBody.message.trim();
  }

  if (
    !Array.isArray(
      requestBody.messages,
    )
  ) {
    return "";
  }

  for (
    let index =
      requestBody.messages.length - 1;
    index >= 0;
    index -= 1
  ) {
    const item =
      requestBody.messages[index];

    if (!isRecord(item)) {
      continue;
    }

    if (
      item.role === "user" &&
      typeof item.content ===
        "string"
    ) {
      return item.content.trim();
    }
  }

  return "";
}

/* =========================================================
   INTENT ROUTER
========================================================= */

function includesAny(
  text: string,
  words: string[],
): boolean {
  return words.some(
    (word) =>
      text.includes(word),
  );
}

function detectIntent(
  message: string,
): Intent {
  const text =
    message.toLowerCase();

  const training =
    includesAny(
      text,
      [
        "training",
        "workout",
        "exercise",
        "hypertrophy",
        "strength",
        "sets",
        "reps",
        "rir",
        "failure",
        "volume",
        "frequency",
        "progressive overload",
        "chest",
        "back",
        "lat",
        "delts",
        "biceps",
        "triceps",
        "quad",
        "hamstring",
        "glute",
        "calves",
        "tập",
        "buổi tập",
        "bài tập",
        "cơ ngực",
        "cơ lưng",
        "cơ vai",
        "chân",
        "tăng cơ",
      ],
    );

  const nutrition =
    includesAny(
      text,
      [
        "food",
        "meal",
        "nutrition",
        "calorie",
        "calories",
        "kcal",
        "protein",
        "carb",
        "carbohydrate",
        "fat",
        "diet",
        "breakfast",
        "lunch",
        "dinner",
        "snack",
        "eat",
        "eating",
        "macro",
        "micronutrient",
        "vitamin",
        "mineral",
        "ăn",
        "món ăn",
        "thực phẩm",
        "calo",
        "dinh dưỡng",
        "bữa",
        "ăn gì",
      ],
    );

  const supplement =
    includesAny(
      text,
      [
        "supplement",
        "creatine",
        "caffeine",
        "whey",
        "casein",
        "beta alanine",
        "beta-alanine",
        "citrulline",
        "taurine",
        "ashwagandha",
        "ksm-66",
        "tribulus",
        "nac",
        "glutamine",
        "bcaa",
        "eaa",
        "omega 3",
        "omega-3",
        "fish oil",
        "vitamin d",
        "magnesium",
        "zinc",
        "boron",
        "alpha gpc",
        "alpha-gpc",
        "coq10",
        "5-htp",
        "bromelain",
        "glucosamine",
        "astaxanthin",
        "dextrose",
        "electrolyte",
        "pre workout",
        "pre-workout",
        "thực phẩm bổ sung",
        "bổ sung",
      ],
    );

  const health =
    includesAny(
      text,
      [
        "health",
        "sleep",
        "recovery",
        "stress",
        "blood pressure",
        "heart",
        "kidney",
        "liver",
        "injury",
        "pain",
        "side effect",
        "interaction",
        "medication",
        "disease",
        "symptom",
        "medical",
        "sức khỏe",
        "giấc ngủ",
        "phục hồi",
        "căng thẳng",
        "đau",
        "tác dụng phụ",
        "thuốc",
        "bệnh",
        "triệu chứng",
      ],
    );

  return {
    training,
    nutrition,
    supplement,
    health,
  };
}

/* =========================================================
   SUPPLEMENT EXTRACTION
========================================================= */

const SUPPLEMENT_TERMS =
  [
    "creatine monohydrate",
    "creatine",
    "caffeine",
    "beta-alanine",
    "beta alanine",
    "l-citrulline",
    "citrulline",
    "taurine",
    "ashwagandha",
    "tribulus",
    "n-acetylcysteine",
    "nac",
    "glutamine",
    "bcaa",
    "eaa",
    "omega-3",
    "omega 3",
    "fish oil",
    "vitamin d",
    "magnesium",
    "zinc",
    "boron",
    "alpha-gpc",
    "alpha gpc",
    "coq10",
    "5-htp",
    "bromelain",
    "glucosamine",
    "astaxanthin",
    "dextrose",
  ] as const;

function extractSupplement(
  message: string,
): string | null {
  const text =
    message.toLowerCase();

  const result =
    SUPPLEMENT_TERMS.find(
      (item) =>
        text.includes(item),
    );

  if (!result) {
    return null;
  }

  if (
    result === "nac"
  ) {
    return "N-acetylcysteine";
  }

  if (
    result === "omega 3"
  ) {
    return "omega-3 fatty acids";
  }

  if (
    result === "alpha gpc"
  ) {
    return "alpha-GPC";
  }

  if (
    result === "beta alanine"
  ) {
    return "beta-alanine";
  }

  return result;
}

/* =========================================================
   LOAD CLIENT DATA
========================================================= */

function summarizeNutritionPlan(
  plan: Awaited<
    ReturnType<typeof loadNutritionContext>
  >["plan"],
): unknown {
  if (!plan) {
    return null;
  }

  return {
    trainingStyle:
      TRAINING_MODE_LABELS[
        plan.input.trainingMode
      ],

    activityLevel:
      ACTIVITY_LEVEL_LABELS[
        plan.input.activityLevel
      ],

    goal:
      NUTRITION_GOAL_LABELS[
        plan.input.goal
      ],

    estimatedMaintenanceCalories:
      plan.maintenanceCalories,

    dailyTargets:
      plan.target,

    meals:
      plan.meals.map(
        (meal) => ({
          name: meal.name,
          purpose: meal.purpose,
          totals: meal.totals,
        }),
      ),

    trainingNotes:
      plan.trainingNotes,
  };
}

async function loadUserContext(
  userId: string,
): Promise<UserContext> {
  const supabase =
    await createClient();

  const [
    profileResponse,
    fitnessResponse,
    preferenceResponse,
    nutritionContext,
  ] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq(
          "user_id",
          userId,
        )
        .maybeSingle(),

      supabase
        .from(
          "fitness_profiles",
        )
        .select("*")
        .eq(
          "user_id",
          userId,
        )
        .maybeSingle(),

      supabase
        .from(
          "user_preferences",
        )
        .select("*")
        .eq(
          "user_id",
          userId,
        )
        .maybeSingle(),

      loadNutritionContext(
        supabase,
        userId,
      ),
    ]);

  if (
    profileResponse.error
  ) {
    console.warn(
      "[DANTE PROFILE]",
      profileResponse.error.message,
    );
  }

  if (
    fitnessResponse.error
  ) {
    console.warn(
      "[DANTE FITNESS PROFILE]",
      fitnessResponse.error.message,
    );
  }

  if (
    preferenceResponse.error
  ) {
    console.warn(
      "[DANTE PREFERENCES]",
      preferenceResponse.error.message,
    );
  }

  return {
    profile:
      profileResponse.data ??
      null,

    fitnessProfile:
      fitnessResponse.data ??
      null,

    preferences:
      preferenceResponse.data ??
      null,

    currentNutritionPlan:
      summarizeNutritionPlan(
        nutritionContext.plan,
      ),
  };
}

/* =========================================================
   PUBMED
========================================================= */

function getNcbiParams() {
  return {
    apiKey:
      process.env.NCBI_API_KEY?.trim(),

    email:
      process.env.NCBI_EMAIL?.trim(),

    tool:
      process.env.NCBI_TOOL?.trim() ||
      "MuscleFitnessDante",
  };
}

async function searchPubMed(
  message: string,
): Promise<PubMedArticle[]> {
  try {
    const {
      apiKey,
      email,
      tool,
    } =
      getNcbiParams();

    const searchUrl =
      new URL(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
      );

    searchUrl.searchParams.set(
      "db",
      "pubmed",
    );

    searchUrl.searchParams.set(
      "retmode",
      "json",
    );

    searchUrl.searchParams.set(
      "retmax",
      "4",
    );

    searchUrl.searchParams.set(
      "sort",
      "relevance",
    );

    searchUrl.searchParams.set(
      "tool",
      tool,
    );

    searchUrl.searchParams.set(
      "term",
      `${truncate(
        message,
        180,
      )} AND (humans[MeSH Terms] OR humans[Filter])`,
    );

    if (apiKey) {
      searchUrl.searchParams.set(
        "api_key",
        apiKey,
      );
    }

    if (email) {
      searchUrl.searchParams.set(
        "email",
        email,
      );
    }

    const searchResponse =
      await fetchWithTimeout(
        searchUrl.toString(),
        {
          cache: "no-store",
        },
        7000,
      );

    if (!searchResponse.ok) {
      return [];
    }

    const searchJson =
      (await searchResponse.json()) as unknown;

    if (
      !isRecord(searchJson) ||
      !isRecord(
        searchJson.esearchresult,
      ) ||
      !Array.isArray(
        searchJson.esearchresult.idlist,
      )
    ) {
      return [];
    }

    const ids =
      searchJson.esearchresult.idlist
        .filter(
          (
            item,
          ): item is string =>
            typeof item ===
            "string",
        )
        .slice(
          0,
          4,
        );

    if (
      ids.length ===
      0
    ) {
      return [];
    }

    const fetchUrl =
      new URL(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
      );

    fetchUrl.searchParams.set(
      "db",
      "pubmed",
    );

    fetchUrl.searchParams.set(
      "id",
      ids.join(","),
    );

    fetchUrl.searchParams.set(
      "retmode",
      "xml",
    );

    fetchUrl.searchParams.set(
      "tool",
      tool,
    );

    if (apiKey) {
      fetchUrl.searchParams.set(
        "api_key",
        apiKey,
      );
    }

    if (email) {
      fetchUrl.searchParams.set(
        "email",
        email,
      );
    }

    const fetchResponse =
      await fetchWithTimeout(
        fetchUrl.toString(),
        {
          cache: "no-store",
        },
        7000,
      );

    if (!fetchResponse.ok) {
      return [];
    }

    const xml =
      await fetchResponse.text();

    const articleBlocks =
      xml.match(
        /<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g,
      ) ??
      [];

    return articleBlocks
      .map(
        (
          block,
        ): PubMedArticle | null => {
          const pmid =
            block.match(
              /<PMID[^>]*>(.*?)<\/PMID>/,
            )?.[1] ??
            "";

          const title =
            decodeXml(
              block.match(
                /<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/,
              )?.[1] ??
                "",
            );

          const journal =
            decodeXml(
              block.match(
                /<Title>([\s\S]*?)<\/Title>/,
              )?.[1] ??
                block.match(
                  /<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/,
                )?.[1] ??
                "",
            );

          const year =
            block.match(
              /<PubDate>[\s\S]*?<Year>(.*?)<\/Year>/,
            )?.[1] ??
            block.match(
              /<MedlineDate>(.*?)<\/MedlineDate>/,
            )?.[1] ??
            "";

          const abstracts =
            [
              ...block.matchAll(
                /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g,
              ),
            ]
              .map(
                (match) =>
                  decodeXml(
                    match[1] ??
                      "",
                  ),
              )
              .filter(Boolean);

          if (
            !pmid ||
            !title
          ) {
            return null;
          }

          return {
            pmid,

            title,

            journal,

            published:
              year,

            abstract:
              truncate(
                abstracts.join(
                  " ",
                ),
                1600,
              ),

            url:
              `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
          };
        },
      )
      .filter(
        (
          article,
        ): article is PubMedArticle =>
          article !==
          null,
      );
  } catch (
    error
  ) {
    console.warn(
      "[DANTE PUBMED]",
      error,
    );

    return [];
  }
}

/* =========================================================
   USDA FOODDATA CENTRAL
========================================================= */

function nutrientValue(
  nutrients: unknown,
  nutrientName: string,
): number | null {
  if (
    !Array.isArray(
      nutrients,
    )
  ) {
    return null;
  }

  const nutrient =
    nutrients.find(
      (item) => {
        if (!isRecord(item)) {
          return false;
        }

        const name =
          getString(
            item.nutrientName,
          ).toLowerCase();

        return name.includes(
          nutrientName.toLowerCase(),
        );
      },
    );

  if (!isRecord(nutrient)) {
    return null;
  }

  return getNumber(
    nutrient.value,
  );
}

async function searchUsda(
  message: string,
): Promise<UsdaFood[]> {
  const apiKey =
    process.env.USDA_FDC_API_KEY?.trim();

  if (!apiKey) {
    return [];
  }

  try {
    const url =
      new URL(
        "https://api.nal.usda.gov/fdc/v1/foods/search",
      );

    url.searchParams.set(
      "api_key",
      apiKey,
    );

    url.searchParams.set(
      "query",
      truncate(
        message,
        120,
      ),
    );

    url.searchParams.set(
      "pageSize",
      "5",
    );

    const response =
      await fetchWithTimeout(
        url.toString(),
        {
          cache: "no-store",
        },
        7000,
      );

    if (!response.ok) {
      return [];
    }

    const data =
      (await response.json()) as unknown;

    if (
      !isRecord(data) ||
      !Array.isArray(
        data.foods,
      )
    ) {
      return [];
    }

    return data.foods
      .map(
        (
          item,
        ): UsdaFood | null => {
          if (!isRecord(item)) {
            return null;
          }

          const fdcId =
            getNumber(
              item.fdcId,
            );

          const name =
            getString(
              item.description,
            );

          if (
            fdcId === null ||
            !name
          ) {
            return null;
          }

          return {
            fdcId,

            name,

            brand:
              getString(
                item.brandOwner,
              ) ||
              null,

            calories:
              nutrientValue(
                item.foodNutrients,
                "energy",
              ),

            protein:
              nutrientValue(
                item.foodNutrients,
                "protein",
              ),

            carbs:
              nutrientValue(
                item.foodNutrients,
                "carbohydrate",
              ),

            fat:
              nutrientValue(
                item.foodNutrients,
                "total lipid",
              ) ??
              nutrientValue(
                item.foodNutrients,
                "total fat",
              ),

            servingSize:
              getNumber(
                item.servingSize,
              ),

            servingUnit:
              getString(
                item.servingSizeUnit,
              ) ||
              null,

            url:
              `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${fdcId}/nutrients`,
          };
        },
      )
      .filter(
        (
          item,
        ): item is UsdaFood =>
          item !== null,
      )
      .slice(
        0,
        5,
      );
  } catch (
    error
  ) {
    console.warn(
      "[DANTE USDA]",
      error,
    );

    return [];
  }
}

/* =========================================================
   OPEN FOOD FACTS
========================================================= */

async function searchOpenFoodFacts(
  message: string,
): Promise<
  OpenFoodFactsProduct[]
> {
  try {
    const url =
      new URL(
        "https://world.openfoodfacts.org/cgi/search.pl",
      );

    url.searchParams.set(
      "search_terms",
      truncate(
        message,
        100,
      ),
    );

    url.searchParams.set(
      "search_simple",
      "1",
    );

    url.searchParams.set(
      "action",
      "process",
    );

    url.searchParams.set(
      "json",
      "1",
    );

    url.searchParams.set(
      "page_size",
      "4",
    );

    url.searchParams.set(
      "fields",
      [
        "code",
        "product_name",
        "brands",
        "nutriments",
      ].join(","),
    );

    const userAgent =
      process.env
        .OPENFOODFACTS_USER_AGENT?.trim() ||
      "MuscleFitnessDante/1.0";

    const response =
      await fetchWithTimeout(
        url.toString(),
        {
          headers: {
            "User-Agent":
              userAgent,
          },

          cache: "no-store",
        },
        7000,
      );

    if (!response.ok) {
      return [];
    }

    const data =
      (await response.json()) as unknown;

    if (
      !isRecord(data) ||
      !Array.isArray(
        data.products,
      )
    ) {
      return [];
    }

    return data.products
      .map(
        (
          item,
        ): OpenFoodFactsProduct | null => {
          if (!isRecord(item)) {
            return null;
          }

          const code =
            getString(
              item.code,
            );

          const name =
            getString(
              item.product_name,
            );

          if (
            !code ||
            !name
          ) {
            return null;
          }

          const nutriments =
            isRecord(
              item.nutriments,
            )
              ? item.nutriments
              : {};

          return {
            code,

            name,

            brand:
              getString(
                item.brands,
              ),

            calories100g:
              getNumber(
                nutriments["energy-kcal_100g"],
              ),

            protein100g:
              getNumber(
                nutriments.proteins_100g,
              ),

            carbs100g:
              getNumber(
                nutriments.carbohydrates_100g,
              ),

            fat100g:
              getNumber(
                nutriments.fat_100g,
              ),

            sugars100g:
              getNumber(
                nutriments.sugars_100g,
              ),

            salt100g:
              getNumber(
                nutriments.salt_100g,
              ),

            url:
              `https://world.openfoodfacts.org/product/${code}`,
          };
        },
      )
      .filter(
        (
          item,
        ): item is OpenFoodFactsProduct =>
          item !== null,
      )
      .slice(
        0,
        4,
      );
  } catch (
    error
  ) {
    console.warn(
      "[DANTE OPEN FOOD FACTS]",
      error,
    );

    return [];
  }
}

/* =========================================================
   PUBCHEM
========================================================= */

async function searchPubChem(
  compound: string | null,
): Promise<PubChemResult | null> {
  if (!compound) {
    return null;
  }

  try {
    const url =
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(
        compound,
      )}/property/Title,MolecularFormula,MolecularWeight/JSON`;

    const response =
      await fetchWithTimeout(
        url,
        {
          cache: "no-store",
        },
        7000,
      );

    if (!response.ok) {
      return null;
    }

    const data =
      (await response.json()) as unknown;

    if (
      !isRecord(data) ||
      !isRecord(
        data.PropertyTable,
      ) ||
      !Array.isArray(
        data.PropertyTable.Properties,
      )
    ) {
      return null;
    }

    const first =
      data.PropertyTable.Properties[0];

    if (!isRecord(first)) {
      return null;
    }

    const cid =
      getNumber(
        first.CID,
      );

    if (cid === null) {
      return null;
    }

    return {
      compound:
        getString(
          first.Title,
        ) ||
        compound,

      cid,

      molecularFormula:
        getString(
          first.MolecularFormula,
        ) ||
        null,

      molecularWeight:
        typeof first.MolecularWeight ===
          "string" ||
        typeof first.MolecularWeight ===
          "number"
          ? first.MolecularWeight
          : null,

      url:
        `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
    };
  } catch (
    error
  ) {
    console.warn(
      "[DANTE PUBCHEM]",
      error,
    );

    return null;
  }
}

/* =========================================================
   OPENFDA
========================================================= */

async function searchOpenFda(
  substance: string | null,
): Promise<OpenFdaResult | null> {
  if (!substance) {
    return null;
  }

  try {
    const url =
      new URL(
        "https://api.fda.gov/drug/label.json",
      );

    url.searchParams.set(
      "search",
      `openfda.generic_name:"${substance}"`,
    );

    url.searchParams.set(
      "limit",
      "1",
    );

    const apiKey =
      process.env.OPENFDA_API_KEY?.trim();

    if (apiKey) {
      url.searchParams.set(
        "api_key",
        apiKey,
      );
    }

    const response =
      await fetchWithTimeout(
        url.toString(),
        {
          cache: "no-store",
        },
        7000,
      );

    if (!response.ok) {
      return null;
    }

    const data =
      (await response.json()) as unknown;

    if (
      !isRecord(data) ||
      !Array.isArray(
        data.results,
      ) ||
      data.results.length ===
        0
    ) {
      return null;
    }

    const item =
      data.results[0];

    if (!isRecord(item)) {
      return null;
    }

    const stringArray =
      (
        value: unknown,
      ): string[] =>
        Array.isArray(value)
          ? value
              .filter(
                (
                  entry,
                ): entry is string =>
                  typeof entry ===
                  "string",
              )
              .map(
                (entry) =>
                  truncate(
                    entry,
                    900,
                  ),
              )
          : [];

    return {
      substance,

      purpose:
        stringArray(
          item.purpose,
        )[0] ??
        null,

      warnings:
        stringArray(
          item.warnings,
        ).slice(
          0,
          2,
        ),

      adverseReactions:
        stringArray(
          item.adverse_reactions,
        ).slice(
          0,
          2,
        ),

      url:
        url.toString(),
    };
  } catch (
    error
  ) {
    console.warn(
      "[DANTE OPENFDA]",
      error,
    );

    return null;
  }
}

/* =========================================================
   BUILD EVIDENCE PACK
========================================================= */

async function getEvidence(
  message: string,
  intent: Intent,
): Promise<EvidenceContext> {
  const supplementName =
    intent.supplement
      ? extractSupplement(
          message,
        )
      : null;

  const needPubMed =
    intent.training ||
    intent.nutrition ||
    intent.supplement ||
    intent.health;

  const [
    pubmed,
    usda,
    openFoodFacts,
    pubchem,
    openFda,
  ] =
    await Promise.all([
      needPubMed
        ? searchPubMed(
            message,
          )
        : Promise.resolve(
            [],
          ),

      intent.nutrition
        ? searchUsda(
            message,
          )
        : Promise.resolve(
            [],
          ),

      intent.nutrition
        ? searchOpenFoodFacts(
            message,
          )
        : Promise.resolve(
            [],
          ),

      intent.supplement
        ? searchPubChem(
            supplementName,
          )
        : Promise.resolve(
            null,
          ),

      (
        intent.supplement ||
        intent.health
      )
        ? searchOpenFda(
            supplementName,
          )
        : Promise.resolve(
            null,
          ),
    ]);

  return {
    pubmed,
    usda,
    openFoodFacts,
    pubchem,
    openFda,
  };
}

/* =========================================================
   DANTE SYSTEM INSTRUCTIONS
========================================================= */

const DANTE_INSTRUCTIONS = `
You are DANTE, the intelligent coaching system inside Muscle Fitness.

Your domains are:

- resistance training
- hypertrophy
- strength training
- exercise programming
- nutrition
- food selection
- calories and macronutrients
- supplements
- sleep
- recovery
- general health education

You receive:

1. CLIENT PROFILE from Muscle Fitness.
2. EXTERNAL EVIDENCE retrieved from trusted data sources.
3. The CLIENT QUESTION.

============================================================
SOURCE PRIORITY
============================================================

For research questions:

Prefer PubMed evidence supplied in EXTERNAL EVIDENCE.

For food calories and macronutrients:

Prefer USDA FoodData Central.

For packaged foods:

Prefer Open Food Facts.

For compound identity:

Use PubChem.

For FDA label information:

Use openFDA only as supporting safety information.

Do not invent a source.

Do not invent a PMID.

Do not invent an FDC ID.

Do not invent product nutrition data.

If external evidence is not available, clearly say that the answer
is based on general coaching knowledge rather than retrieved source data.

============================================================
CLIENT PERSONALIZATION
============================================================

Use client data only when it actually exists.

Relevant fields may include:

- goal
- weight
- height
- experience
- training frequency
- session duration
- calorie target
- protein target
- carbohydrate target
- fat target
- food preferences
- excluded foods
- allergies
- sleep
- stress
- physical limitations
- available equipment
- priority muscles
- currentNutritionPlan (the client's active training style, activity
  level, goal, estimated maintenance calories, daily macro targets,
  gram-based meals and training-specific notes — already computed by
  the Muscle Fitness nutrition engine, so use it directly instead of
  recalculating)

Never invent missing client information.

Never recommend foods listed under allergies or excluded foods.

============================================================
TRAINING
============================================================

When discussing training:

Explain exercise selection, sets, reps, RIR, rest periods,
frequency, volume, technique and progression where relevant.

Do not automatically prescribe failure on every exercise.

Distinguish technical multi-joint exercises from stable isolation work.

Prioritize sustainable progression and repeatable technique.

============================================================
NUTRITION
============================================================

When discussing food:

If external nutrient information is available, use those values.

Clearly label estimates when a restaurant meal, serving size,
recipe or product is not exact.

When useful include:

- portion
- estimated calories
- protein
- carbohydrates
- fats
- meal timing
- reason it fits the client's goal

============================================================
SUPPLEMENTS
============================================================

When discussing supplements:

Distinguish:

- evidence for effectiveness
- typical evidence-based use
- possible side effects
- contraindications / interactions
- uncertainty

Do not present weak evidence as certainty.

Do not tell a client to stop prescribed medication.

============================================================
HEALTH SAFETY
============================================================

You provide health education, not diagnosis.

Do not diagnose diseases.

Do not replace a licensed clinician.

For potentially serious symptoms, medication interactions,
pregnancy, significant kidney/liver/heart conditions,
or other high-risk medical circumstances,
recommend appropriate professional medical evaluation.

============================================================
PRIMARY RESPONSE LANGUAGE
============================================================

English is DANTE's primary and default language.

Always answer in clear, natural English unless the client explicitly
asks for another response language.

Do not automatically switch to Vietnamese merely because:

- the client writes the question in Vietnamese
- the client profile contains Vietnamese text
- preferences or prior context contain Vietnamese text
- retrieved external evidence contains Vietnamese text
- the browser, device, or inferred locale appears to be Vietnamese

A Vietnamese question without an explicit language request must still
receive an English answer.

Examples:

Client:
"Tôi nên ăn bao nhiêu protein một ngày?"

Response language:
English.

Client:
"Trả lời bằng tiếng Việt: tôi nên ăn bao nhiêu protein một ngày?"

Response language:
Vietnamese.

A request for another language applies only to the relevant response
unless the client explicitly asks DANTE to continue using that language.

If language preference is ambiguous, use English.

Keep standard fitness and sports-science terminology in English where
appropriate, including exercise names such as Bench Press, Romanian
Deadlift, Lat Pulldown, Leg Press, Lateral Raise and similar established
terms.

============================================================
ANSWER STYLE
============================================================

Use clean Markdown.

Be practical and specific.

Use professional, natural English by default.

Avoid awkward literal translations and unnecessary language mixing.

Do not expose internal reasoning.

Do not mention hidden reasoning.

Do not output chain-of-thought.

When external sources materially support the answer,
finish with a short section called:

Sources checked

Only list sources actually supplied in EXTERNAL EVIDENCE.
`;

/* =========================================================
   BUILD PROMPT
========================================================= */

function buildDantePrompt(
  userMessage: string,
  userContext: UserContext,
  evidence: EvidenceContext,
): string {
  return `
${DANTE_INSTRUCTIONS}

============================================================
CLIENT PROFILE
============================================================

${JSON.stringify(
  userContext,
  null,
  2,
)}

============================================================
EXTERNAL EVIDENCE
============================================================

${JSON.stringify(
  evidence,
  null,
  2,
)}

============================================================
CLIENT QUESTION
============================================================

${userMessage}

============================================================
FINAL INSTRUCTION
============================================================

Answer the client directly.

Use the evidence when relevant.

Do not quote long passages from source material.

Unless the client explicitly requested another response language,
the entire final user-facing answer MUST be in English.

Do not infer Vietnamese output from the language of the client's
question, profile, preferences, or retrieved context.

Return only the final user-facing answer.
`;
}

/* =========================================================
   GROQ
========================================================= */

function getGroqKey(): string {
  const apiKey =
    process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is missing from .env.local",
    );
  }

  return apiKey;
}

function getGroqModels(): string[] {
  return Array.from(
    new Set(
      [
        process.env.GROQ_MODEL?.trim(),

        "openai/gpt-oss-120b",

        "openai/gpt-oss-20b",

        "llama-3.3-70b-versatile",
      ].filter(
        (
          model,
        ): model is string =>
          Boolean(model),
      ),
    ),
  );
}

/* =========================================================
   SINGLE GROQ REQUEST
========================================================= */

async function callGroqModel(
  model: string,
  prompt: string,
): Promise<DanteResult | null> {
  const apiKey =
    getGroqKey();

  const gptOss =
    model.startsWith(
      "openai/gpt-oss",
    );

  const requestBody:
    Record<string, unknown> =
    {
      model,

      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],

      temperature:
        gptOss
          ? 0.55
          : 0.4,

      top_p:
        0.95,

      max_completion_tokens:
        gptOss
          ? 4096
          : 2048,
    };

  /*
   * GPT-OSS reasoning configuration.
   *
   * reasoning_format=hidden means only the
   * final answer should reach message.content.
   */
  if (gptOss) {
    requestBody.reasoning_effort =
      "low";

    requestBody.reasoning_format =
      "hidden";
  }

  const response =
    await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${apiKey}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(
            requestBody,
          ),
      },
      30000,
    );

  const data =
    (await response.json()) as GroqApiResponse;

  if (!response.ok) {
    const message =
      data.error?.message ??
      `Groq returned HTTP ${response.status}.`;

    /*
     * 401 means the key itself is bad.
     * A model fallback cannot fix that.
     */
    if (
      response.status ===
      401
    ) {
      throw new Error(
        "Groq rejected GROQ_API_KEY. Create a new Groq key and update .env.local.",
      );
    }

    throw new Error(
      `${model}: ${message}`,
    );
  }

  const choice =
    data.choices?.[0];

  const rawContent =
    choice
      ?.message
      ?.content;

  const reply =
    typeof rawContent ===
      "string"
      ? rawContent.trim()
      : "";

  console.log(
    "[DANTE MODEL RESULT]",
    {
      model,

      finishReason:
        choice
          ?.finish_reason ??
        null,

      hasContent:
        reply.length >
        0,

      contentLength:
        reply.length,

      promptTokens:
        data.usage
          ?.prompt_tokens ??
        null,

      completionTokens:
        data.usage
          ?.completion_tokens ??
        null,
    },
  );

  if (!reply) {
    return null;
  }

  return {
    reply,
    model,
  };
}

/* =========================================================
   GROQ WITH FALLBACK
========================================================= */

async function generateDanteReply(
  prompt: string,
): Promise<DanteResult> {
  const models =
    getGroqModels();

  let lastError:
    Error | null =
    null;

  for (
    const model of models
  ) {
    try {
      console.log(
        `[DANTE] Trying ${model}`,
      );

      const result =
        await callGroqModel(
          model,
          prompt,
        );

      if (result) {
        return result;
      }

      lastError =
        new Error(
          `${model} returned empty assistant content.`,
        );

      console.warn(
        `[DANTE] ${model} returned empty content. Trying fallback.`,
      );
    } catch (
      error: unknown
    ) {
      const resolvedError =
        error instanceof Error
          ? error
          : new Error(
              String(error),
            );

      lastError =
        resolvedError;

      console.error(
        `[DANTE] ${model} failed:`,
        resolvedError.message,
      );

      /*
       * Invalid API key:
       * no reason to call the next model.
       */
      if (
        resolvedError.message.includes(
          "GROQ_API_KEY",
        )
      ) {
        throw resolvedError;
      }
    }
  }

  throw new Error(
    lastError?.message ??
      "All Dante models failed to produce a final answer.",
  );
}

/* =========================================================
   SOURCE LIST
========================================================= */

function getSources(
  evidence: EvidenceContext,
): SourceItem[] {
  const sources:
    SourceItem[] =
    [];

  for (
    const article of evidence.pubmed
  ) {
    sources.push({
      type:
        "PubMed",

      title:
        article.title,

      url:
        article.url,
    });
  }

  for (
    const food of evidence.usda
  ) {
    sources.push({
      type:
        "USDA FoodData Central",

      title:
        food.name,

      url:
        food.url,
    });
  }

  for (
    const product of evidence.openFoodFacts
  ) {
    sources.push({
      type:
        "Open Food Facts",

      title:
        product.name,

      url:
        product.url,
    });
  }

  if (
    evidence.pubchem
  ) {
    sources.push({
      type:
        "PubChem",

      title:
        evidence.pubchem.compound,

      url:
        evidence.pubchem.url,
    });
  }

  if (
    evidence.openFda
  ) {
    sources.push({
      type:
        "openFDA",

      title:
        evidence.openFda.substance,

      url:
        evidence.openFda.url,
    });
  }

  return sources.slice(
    0,
    12,
  );
}

/* =========================================================
   GET — HEALTH CHECK
========================================================= */

export async function GET() {
  return Response.json({
    ok: true,

    service:
      "Dante — Muscle Fitness Intelligence",

    status:
      "ready",

    mode:
      process.env.GROQ_API_KEY
        ? "production"
        : "configuration-required",

    providers: {
      groq:
        Boolean(
          process.env.GROQ_API_KEY,
        ),

      usda:
        Boolean(
          process.env.USDA_FDC_API_KEY,
        ),

      pubmed:
        true,

      pubmedApiKey:
        Boolean(
          process.env.NCBI_API_KEY,
        ),

      pubchem:
        true,

      openFoodFacts:
        true,

      openFda:
        true,

      openFdaApiKey:
        Boolean(
          process.env.OPENFDA_API_KEY,
        ),
    },
  });
}

/* =========================================================
   POST
========================================================= */

export async function POST(
  request: Request,
) {
  try {
    /* -----------------------------------------------------
       PARSE
    ----------------------------------------------------- */

    let body:
      unknown;

    try {
      body =
        await request.json();
    } catch {
      return Response.json(
        {
          ok: false,

          error:
            "Invalid JSON request.",
        },
        {
          status: 400,
        },
      );
    }

    const userMessage =
      getUserMessage(
        body,
      );

    if (!userMessage) {
      return Response.json(
        {
          ok: false,

          error:
            "Please provide a message.",
        },
        {
          status: 400,
        },
      );
    }

    /* -----------------------------------------------------
       AUTH
    ----------------------------------------------------- */

    const supabase =
      await createClient();

    const {
      data: {
        user,
      },
      error:
        authError,
    } =
      await supabase.auth.getUser();

    if (
      authError ||
      !user
    ) {
      return Response.json(
        {
          ok: false,

          error:
            "You must be logged in to use Dante.",
        },
        {
          status: 401,
        },
      );
    }

    /* -----------------------------------------------------
       INTENT
    ----------------------------------------------------- */

    const intent =
      detectIntent(
        userMessage,
      );

    /* -----------------------------------------------------
       PROFILE + EXTERNAL DATA

       Run both in parallel.
    ----------------------------------------------------- */

    const [
      userContext,
      evidence,
    ] =
      await Promise.all([
        loadUserContext(
          user.id,
        ),

        getEvidence(
          userMessage,
          intent,
        ),
      ]);

    /* -----------------------------------------------------
       PROMPT
    ----------------------------------------------------- */

    const prompt =
      buildDantePrompt(
        userMessage,
        userContext,
        evidence,
      );

    /* -----------------------------------------------------
       GROQ
    ----------------------------------------------------- */

    const {
      reply,
      model,
    } =
      await generateDanteReply(
        prompt,
      );

    /* -----------------------------------------------------
       SOURCES
    ----------------------------------------------------- */

    const sources =
      getSources(
        evidence,
      );

    /* -----------------------------------------------------
       SUCCESS
    ----------------------------------------------------- */

    return Response.json(
      {
        ok: true,

        /*
         * Keep both for frontend compatibility.
         */
        reply,

        message:
          reply,

        model,

        mode:
          "production",

        intent,

        externalKnowledgeUsed:
          sources.length >
          0,

        sources,
      },
      {
        status: 200,
      },
    );
  } catch (
    error: unknown
  ) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Dante error.";

    console.error(
      "[DANTE API ERROR]",
      error,
    );

    return Response.json(
      {
        ok: false,

        error:
          process.env.NODE_ENV ===
          "development"
            ? message
            : "Dante could not generate a response.",

        details:
          process.env.NODE_ENV ===
          "development"
            ? message
            : undefined,
      },
      {
        status: 500,
      },
    );
  }
}