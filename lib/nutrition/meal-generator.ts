import type {
  CarbDay,
  FitnessProfile,
  NutritionTargets,
} from "@/lib/client/client-profile";

import {
  FOOD_DB,
  getFoodById,
} from "@/lib/nutrition/food";

import {
  calculateNutritionTargets,
} from "@/lib/fitness/calorie";

/* =========================================================
   TYPES
========================================================= */

export interface MealPlanFood {
  foodId: string;

  name: string;

  grams: number;

  calories: number;

  protein: number;

  carbs: number;

  fat: number;

  fiber: number;
}

export interface MealPlanMeal {
  id: string;

  name: string;

  time: string;

  foods:
    MealPlanFood[];

  totals: {
    calories: number;

    protein: number;

    carbs: number;

    fat: number;

    fiber: number;
  };
}

export interface MealPlan {
  meals:
    MealPlanMeal[];

  totals: {
    calories: number;

    protein: number;

    carbs: number;

    fat: number;

    fiber: number;
  };

  carbDay:
    CarbDay;

  createdAt:
    string;
}

/* =========================================================
   MEAL ROLES
========================================================= */

const MEAL_ROLES = [
  "breakfast",

  "pre-workout",

  "post-workout",

  "lunch",

  "snack",

  "dinner",

  "final-meal",
] as const;

/* =========================================================
   DISTRIBUTION
========================================================= */

const MEAL_DISTRIBUTION: Record<
  string,
  {
    calories: number;

    protein: number;

    carbs: number;

    fat: number;
  }
> = {
  breakfast: {
    calories: 0.25,

    protein: 0.2,

    carbs: 0.25,

    fat: 0.3,
  },

  "pre-workout": {
    calories: 0.15,

    protein: 0.15,

    carbs: 0.25,

    fat: 0.05,
  },

  "post-workout": {
    calories: 0.2,

    protein: 0.3,

    carbs: 0.2,

    fat: 0.1,
  },

  lunch: {
    calories: 0.25,

    protein: 0.25,

    carbs: 0.2,

    fat: 0.25,
  },

  snack: {
    calories: 0.1,

    protein: 0.1,

    carbs: 0.1,

    fat: 0.1,
  },

  dinner: {
    calories: 0.25,

    protein: 0.25,

    carbs: 0.15,

    fat: 0.3,
  },

  "final-meal": {
    calories: 0.1,

    protein: 0.05,

    carbs: 0.05,

    fat: 0.15,
  },
};

/* =========================================================
   HELPERS
========================================================= */

function clampGrams(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(
    Math.max(
      value,
      min,
    ),
    max,
  );
}

/* =========================================================
   MAIN ENGINE
========================================================= */

export function generateMealPlan(
  profile:
    FitnessProfile,

  targets:
    NutritionTargets,

  carbDay:
    CarbDay = "normal",
): MealPlan {
  /*
   * For a normal day, preserve the explicit nutrition
   * targets supplied by the application.
   *
   * Low/high carb days are recalculated from the profile.
   *
   * This also means `targets` is genuinely used instead of
   * being an unused parameter.
   */

  const adjustedTargets =
    carbDay ===
    "normal"
      ? targets
      : calculateNutritionTargets(
          profile,
          carbDay,
        );

  const mealsPerDay =
    Math.min(
      Math.max(
        profile.mealsPerDay ||
          3,
        1,
      ),
      MEAL_ROLES.length,
    );

  const totalCalories =
    adjustedTargets.calories;

  const totalProtein =
    adjustedTargets.protein;

  const totalCarbs =
    adjustedTargets.carbs;

  const totalFat =
    adjustedTargets.fat;

  const mealRoles =
    MEAL_ROLES.slice(
      0,
      mealsPerDay,
    );

  const trainingTime =
    profile.preferredTrainingTime ||
    "08:00";

  const parsedTrainingHour =
    Number.parseInt(
      trainingTime.split(
        ":",
      )[0] ??
        "8",
      10,
    );

  const trainingHour =
    Number.isFinite(
      parsedTrainingHour,
    )
      ? parsedTrainingHour
      : 8;

  const isMorningWorkout =
    trainingHour < 12;

  /* =======================================================
     GENERATE MEALS
  ======================================================= */

  const meals:
    MealPlanMeal[] =
    mealRoles.map(
      (
        role,
        index,
      ) => {
        const distribution =
          MEAL_DISTRIBUTION[
            role
          ] ??
          MEAL_DISTRIBUTION.lunch;

        const calTarget =
          Math.round(
            totalCalories *
              distribution.calories,
          );

        const proteinTarget =
          Math.round(
            totalProtein *
              distribution.protein,
          );

        const carbTarget =
          Math.round(
            totalCarbs *
              distribution.carbs,
          );

        const fatTarget =
          Math.round(
            totalFat *
              distribution.fat,
          );

        const foods =
          selectFoodsForMeal(
            profile,
            role,
            calTarget,
            proteinTarget,
            carbTarget,
            fatTarget,
          );

        const totals =
          calculateMealTotals(
            foods,
          );

        return {
          id:
            `meal_${index}`,

          name:
            role
              .replaceAll(
                "-",
                " ",
              )
              .toUpperCase(),

          time:
            getMealTime(
              role,
              trainingHour,
              isMorningWorkout,
            ),

          foods,

          totals,
        };
      },
    );

  /* =======================================================
     GRAND TOTALS
  ======================================================= */

  const grandTotals =
    meals.reduce(
      (
        accumulator,
        meal,
      ) => ({
        calories:
          accumulator.calories +
          meal.totals.calories,

        protein:
          accumulator.protein +
          meal.totals.protein,

        carbs:
          accumulator.carbs +
          meal.totals.carbs,

        fat:
          accumulator.fat +
          meal.totals.fat,

        fiber:
          accumulator.fiber +
          meal.totals.fiber,
      }),
      {
        calories: 0,

        protein: 0,

        carbs: 0,

        fat: 0,

        fiber: 0,
      },
    );

  return {
    meals,

    totals:
      grandTotals,

    carbDay,

    createdAt:
      new Date().toISOString(),
  };
}

/* =========================================================
   FOOD SELECTION
========================================================= */

function selectFoodsForMeal(
  profile:
    FitnessProfile,

  role:
    string,

  calTarget:
    number,

  proteinTarget:
    number,

  carbTarget:
    number,

  fatTarget:
    number,
): MealPlanFood[] {
  const selected:
    MealPlanFood[] = [];

  let remainingCal =
    calTarget;

  let remainingProtein =
    proteinTarget;

  let remainingCarbs =
    carbTarget;

  let remainingFat =
    fatTarget;

  /* =======================================================
     FILTER ALLERGIES + DISLIKED FOODS

     This was previously `let availableFoods`.
     It is never reassigned, so it must be `const`.
  ======================================================= */

  const availableFoods =
    FOOD_DB.filter(
      (food) => {
        const foodName =
          food.name.toLowerCase();

        const hasAllergy =
          profile.allergies.some(
            (allergy) =>
              foodName.includes(
                allergy.toLowerCase(),
              ),
          );

        if (hasAllergy) {
          return false;
        }

        const isDisliked =
          profile.dislikedFoods.some(
            (dislikedFood) =>
              foodName.includes(
                dislikedFood.toLowerCase(),
              ),
          );

        return !isDisliked;
      },
    );

  /* =======================================================
     CATEGORY PRIORITY
  ======================================================= */

  let prioritizedCategories:
    string[];

  if (
    role ===
      "breakfast" ||
    role ===
      "pre-workout"
  ) {
    prioritizedCategories = [
      "carbs",
      "protein",
    ];
  } else if (
    role ===
    "post-workout"
  ) {
    prioritizedCategories = [
      "protein",
      "carbs",
    ];
  } else if (
    role ===
      "dinner" ||
    role ===
      "final-meal"
  ) {
    prioritizedCategories = [
      "protein",
      "fat",
      "vegetable",
    ];
  } else {
    prioritizedCategories = [
      "protein",
      "carbs",
      "fat",
      "vegetable",
    ];
  }

  /* =======================================================
     SELECT FOODS
  ======================================================= */

  for (
    const category of
      prioritizedCategories
  ) {
    if (
      remainingCal <=
      0
    ) {
      break;
    }

    const categoryFoods =
      availableFoods.filter(
        (food) =>
          food.category ===
          category,
      );

    if (
      categoryFoods.length ===
      0
    ) {
      continue;
    }

    const numberOfFoods =
      Math.min(
        Math.max(
          1,
          Math.floor(
            Math.random() *
              2,
          ) + 1,
        ),
        categoryFoods.length,
      );

    /*
     * Copy the array before sorting so we do not mutate
     * any source array accidentally.
     */

    const shuffled = [
      ...categoryFoods,
    ].sort(
      () =>
        Math.random() -
        0.5,
    );

    const chosen =
      shuffled.slice(
        0,
        numberOfFoods,
      );

    for (
      const food of chosen
    ) {
      let maxGrams =
        500;

      /* ---------------------------------------------------
         CALORIES
      --------------------------------------------------- */

      if (
        food.caloriesPer100g >
        0
      ) {
        maxGrams =
          Math.min(
            500,

            (
              remainingCal /
              food.caloriesPer100g
            ) * 100,
          );
      }

      /* ---------------------------------------------------
         PROTEIN
      --------------------------------------------------- */

      if (
        food.proteinPer100g >
          0 &&
        remainingProtein >
          0
      ) {
        const proteinGrams =
          (
            remainingProtein /
            food.proteinPer100g
          ) * 100;

        maxGrams =
          Math.min(
            maxGrams,
            proteinGrams *
              1.5,
          );
      }

      /* ---------------------------------------------------
         CARBOHYDRATES
      --------------------------------------------------- */

      if (
        food.carbsPer100g >
          0 &&
        remainingCarbs >
          0
      ) {
        const carbGrams =
          (
            remainingCarbs /
            food.carbsPer100g
          ) * 100;

        maxGrams =
          Math.min(
            maxGrams,
            carbGrams *
              1.5,
          );
      }

      /* ---------------------------------------------------
         FAT
      --------------------------------------------------- */

      if (
        food.fatPer100g >
          0 &&
        remainingFat >
          0
      ) {
        const fatGrams =
          (
            remainingFat /
            food.fatPer100g
          ) * 100;

        maxGrams =
          Math.min(
            maxGrams,
            fatGrams *
              1.5,
          );
      }

      if (
        maxGrams <=
        0
      ) {
        continue;
      }

      const grams =
        clampGrams(
          Math.round(
            maxGrams *
              (
                0.6 +
                Math.random() *
                  0.4
              ),
          ),
          Math.min(
            50,
            maxGrams,
          ),
          maxGrams,
        );

      if (
        grams < 20
      ) {
        continue;
      }

      const factor =
        grams / 100;

      const mealFood:
        MealPlanFood = {
        foodId:
          food.id,

        name:
          food.name,

        grams,

        calories:
          Math.round(
            food.caloriesPer100g *
              factor,
          ),

        protein:
          roundMacro(
            food.proteinPer100g *
              factor,
          ),

        carbs:
          roundMacro(
            food.carbsPer100g *
              factor,
          ),

        fat:
          roundMacro(
            food.fatPer100g *
              factor,
          ),

        fiber:
          roundMacro(
            food.fiberPer100g *
              factor,
          ),
      };

      selected.push(
        mealFood,
      );

      remainingCal -=
        mealFood.calories;

      remainingProtein -=
        mealFood.protein;

      remainingCarbs -=
        mealFood.carbs;

      remainingFat -=
        mealFood.fat;
    }
  }

  /* =======================================================
     PROTEIN FALLBACK
  ======================================================= */

  if (
    remainingProtein >
      20 &&
    selected.length >
      0
  ) {
    const chicken =
      getFoodById(
        "chicken_breast",
      );

    if (
      chicken &&
      chicken.proteinPer100g >
        0
    ) {
      const grams =
        Math.max(
          20,

          Math.round(
            (
              remainingProtein /
              chicken.proteinPer100g
            ) * 100,
          ),
        );

      const factor =
        grams / 100;

      selected.push({
        foodId:
          chicken.id,

        name:
          chicken.name,

        grams,

        calories:
          Math.round(
            chicken.caloriesPer100g *
              factor,
          ),

        protein:
          roundMacro(
            chicken.proteinPer100g *
              factor,
          ),

        carbs:
          roundMacro(
            chicken.carbsPer100g *
              factor,
          ),

        fat:
          roundMacro(
            chicken.fatPer100g *
              factor,
          ),

        fiber:
          roundMacro(
            chicken.fiberPer100g *
              factor,
          ),
      });
    }
  }

  return selected;
}

/* =========================================================
   MACRO ROUNDING
========================================================= */

function roundMacro(
  value: number,
): number {
  return (
    Math.round(
      value * 10,
    ) / 10
  );
}

/* =========================================================
   TOTALS
========================================================= */

function calculateMealTotals(
  foods:
    MealPlanFood[],
): MealPlanMeal["totals"] {
  return foods.reduce(
    (
      accumulator,
      food,
    ) => ({
      calories:
        accumulator.calories +
        food.calories,

      protein:
        accumulator.protein +
        food.protein,

      carbs:
        accumulator.carbs +
        food.carbs,

      fat:
        accumulator.fat +
        food.fat,

      fiber:
        accumulator.fiber +
        food.fiber,
    }),
    {
      calories: 0,

      protein: 0,

      carbs: 0,

      fat: 0,

      fiber: 0,
    },
  );
}

/* =========================================================
   MEAL TIME
========================================================= */

function getMealTime(
  role: string,
  trainingHour: number,
  isMorning: boolean,
): string {
  const eveningPreWorkout =
    Math.max(
      0,
      trainingHour - 1,
    );

  const eveningPostWorkout =
    Math.min(
      23,
      trainingHour + 1,
    );

  const times:
    Record<
      string,
      string
    > = {
    breakfast:
      isMorning
        ? "07:00"
        : "08:30",

    "pre-workout":
      isMorning
        ? "06:30"
        : `${String(
            eveningPreWorkout,
          ).padStart(
            2,
            "0",
          )}:00`,

    "post-workout":
      isMorning
        ? "08:30"
        : `${String(
            eveningPostWorkout,
          ).padStart(
            2,
            "0",
          )}:00`,

    lunch:
      "12:30",

    snack:
      "15:30",

    dinner:
      "19:30",

    "final-meal":
      "21:30",
  };

  return (
    times[role] ??
    "12:00"
  );
}

/* =========================================================
   REGENERATE
========================================================= */

export function regenerateMealPlan(
  profile:
    FitnessProfile,

  targets:
    NutritionTargets,

  carbDay:
    CarbDay = "normal",
): MealPlan {
  return generateMealPlan(
    profile,
    targets,
    carbDay,
  );
}

/* =========================================================
   SWAP FOOD
========================================================= */

export function swapFood(
  mealPlan:
    MealPlan,

  mealIndex:
    number,

  foodIndex:
    number,

  newFoodId:
    string,
): MealPlan {
  const newMeals =
    mealPlan.meals.map(
      (meal) => ({
        ...meal,

        foods: [
          ...meal.foods,
        ],
      }),
    );

  const meal =
    newMeals[
      mealIndex
    ];

  if (!meal) {
    return mealPlan;
  }

  const oldFood =
    meal.foods[
      foodIndex
    ];

  if (!oldFood) {
    return mealPlan;
  }

  const newFood =
    getFoodById(
      newFoodId,
    );

  if (!newFood) {
    return mealPlan;
  }

  const grams =
    oldFood.grams;

  const factor =
    grams / 100;

  const updatedFood:
    MealPlanFood = {
    foodId:
      newFood.id,

    name:
      newFood.name,

    grams,

    calories:
      Math.round(
        newFood.caloriesPer100g *
          factor,
      ),

    protein:
      roundMacro(
        newFood.proteinPer100g *
          factor,
      ),

    carbs:
      roundMacro(
        newFood.carbsPer100g *
          factor,
      ),

    fat:
      roundMacro(
        newFood.fatPer100g *
          factor,
      ),

    fiber:
      roundMacro(
        newFood.fiberPer100g *
          factor,
      ),
  };

  meal.foods[
    foodIndex
  ] =
    updatedFood;

  meal.totals =
    calculateMealTotals(
      meal.foods,
    );

  const grandTotals =
    newMeals.reduce(
      (
        accumulator,
        currentMeal,
      ) => ({
        calories:
          accumulator.calories +
          currentMeal.totals.calories,

        protein:
          accumulator.protein +
          currentMeal.totals.protein,

        carbs:
          accumulator.carbs +
          currentMeal.totals.carbs,

        fat:
          accumulator.fat +
          currentMeal.totals.fat,

        fiber:
          accumulator.fiber +
          currentMeal.totals.fiber,
      }),
      {
        calories: 0,

        protein: 0,

        carbs: 0,

        fat: 0,

        fiber: 0,
      },
    );

  return {
    ...mealPlan,

    meals:
      newMeals,

    totals:
      grandTotals,
  };
}

/* =========================================================
   CHANGE MEAL COUNT
========================================================= */

export function changeMealCount(
  mealPlan:
    MealPlan,

  newCount:
    number,

  profile:
    FitnessProfile,

  targets:
    NutritionTargets,
): MealPlan {
  const updatedProfile:
    FitnessProfile = {
    ...profile,

    mealsPerDay:
      newCount,
  };

  return generateMealPlan(
    updatedProfile,
    targets,
    mealPlan.carbDay,
  );
}

/* =========================================================
   CHANGE CARB DAY
========================================================= */

export function changeCarbDay(
  mealPlan:
    MealPlan,

  newCarbDay:
    CarbDay,

  profile:
    FitnessProfile,

  targets:
    NutritionTargets,
): MealPlan {
  return generateMealPlan(
    profile,
    targets,
    newCarbDay,
  );
}

/* =========================================================
   REPLACE INGREDIENT
========================================================= */

export function replaceIngredient(
  mealPlan:
    MealPlan,

  mealIndex:
    number,

  foodIndex:
    number,

  newFoodId:
    string,
): MealPlan {
  return swapFood(
    mealPlan,
    mealIndex,
    foodIndex,
    newFoodId,
  );
}