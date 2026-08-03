"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import styles from "./page.module.css";

/* =========================================================
   TYPES
========================================================= */

type Gender = "male" | "female";

type AgeGroup =
  | "youth"
  | "youngAdult"
  | "adult36Plus";

type Goal = "cut" | "maintain" | "bulk";

type ActivityLevel =
  | "sedentary"
  | "lowActive"
  | "active"
  | "veryActive";

type DietPreference =
  | "balanced"
  | "highProtein"
  | "lowFat"
  | "vegetarian";

type AgeGroupConfiguration = {
  label: string;
  title: string;
  description: string;
  minAge: number;
  maxAge: number;
  defaultAge: number;
};

type MacroResult = {
  maintenanceCalories: number;
  targetCalories: number;
  protein: number;
  carbs: number;
  fat: number;

  genderLabel: string;
  ageGroupLabel: string;
  formulaLabel: string;
  goalLabel: string;
  profileNote: string;
};

type MealExample = {
  title: string;
  foods: string;
};

/* =========================================================
   CONFIGURATION
========================================================= */

const AGE_GROUPS: Record<
  AgeGroup,
  AgeGroupConfiguration
> = {
  youth: {
    label: "6–18",
    title: "YOUTH & GROWTH",
    description:
      "Nutrition focused on energy, growth and healthy development.",
    minAge: 6,
    maxAge: 18,
    defaultAge: 16,
  },

  youngAdult: {
    label: "19–35",
    title: "PERFORMANCE",
    description:
      "Nutrition focused on performance, muscle and body composition.",
    minAge: 19,
    maxAge: 35,
    defaultAge: 25,
  },

  adult36Plus: {
    label: "36+",
    title: "RECOVERY & LONGEVITY",
    description:
      "Nutrition with more conservative adjustments and recovery awareness.",
    minAge: 36,
    maxAge: 120,
    defaultAge: 40,
  },
};

const AGE_GROUP_ORDER: AgeGroup[] = [
  "youth",
  "youngAdult",
  "adult36Plus",
];

/*
 * Physical Activity coefficients used by the
 * sex-specific EER calculations.
 */

const YOUTH_ACTIVITY_COEFFICIENTS: Record<
  Gender,
  Record<ActivityLevel, number>
> = {
  male: {
    sedentary: 1,
    lowActive: 1.13,
    active: 1.26,
    veryActive: 1.42,
  },

  female: {
    sedentary: 1,
    lowActive: 1.16,
    active: 1.31,
    veryActive: 1.56,
  },
};

const ADULT_ACTIVITY_COEFFICIENTS: Record<
  Gender,
  Record<ActivityLevel, number>
> = {
  male: {
    sedentary: 1,
    lowActive: 1.11,
    active: 1.25,
    veryActive: 1.48,
  },

  female: {
    sedentary: 1,
    lowActive: 1.12,
    active: 1.27,
    veryActive: 1.45,
  },
};

/*
 * Percentage of daily calories allocated
 * to each meal.
 */

const MEAL_DISTRIBUTIONS: Record<number, number[]> = {
  2: [0.45, 0.55],

  3: [0.3, 0.35, 0.35],

  4: [0.23, 0.27, 0.2, 0.3],

  5: [0.18, 0.22, 0.18, 0.16, 0.26],

  6: [0.15, 0.18, 0.17, 0.15, 0.15, 0.2],
};

/* =========================================================
   CALCULATION FUNCTIONS
========================================================= */

function getActivityCoefficient(
  gender: Gender,
  ageGroup: AgeGroup,
  activity: ActivityLevel
) {
  if (ageGroup === "youth") {
    return YOUTH_ACTIVITY_COEFFICIENTS[gender][activity];
  }

  return ADULT_ACTIVITY_COEFFICIENTS[gender][activity];
}

function calculateMaintenanceCalories({
  gender,
  age,
  ageGroup,
  heightCm,
  weightKg,
  activity,
}: {
  gender: Gender;
  age: number;
  ageGroup: AgeGroup;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
}) {
  const heightMetres = heightCm / 100;

  const activityCoefficient =
    getActivityCoefficient(
      gender,
      ageGroup,
      activity
    );

  /*
   * Ages 6–18:
   * sex-specific youth EER equations.
   */

  if (ageGroup === "youth") {
    const growthEnergy =
      age <= 8 ? 20 : 25;

    if (gender === "male") {
      return (
        88.5 -
        61.9 * age +
        activityCoefficient *
          (
            26.7 * weightKg +
            903 * heightMetres
          ) +
        growthEnergy
      );
    }

    return (
      135.3 -
      30.8 * age +
      activityCoefficient *
        (
          10 * weightKg +
          934 * heightMetres
        ) +
      growthEnergy
    );
  }

  /*
   * Ages 19+:
   * sex-specific adult EER equations.
   */

  if (gender === "male") {
    return (
      662 -
      9.53 * age +
      activityCoefficient *
        (
          15.91 * weightKg +
          539.6 * heightMetres
        )
    );
  }

  return (
    354 -
    6.91 * age +
    activityCoefficient *
      (
        9.36 * weightKg +
        726 * heightMetres
      )
  );
}

function getGoalMultiplier(
  ageGroup: AgeGroup,
  goal: Goal
) {
  /*
   * Youth mode remains at maintenance.
   */

  if (ageGroup === "youth") {
    return 1;
  }

  /*
   * Ages 19–35.
   */

  if (ageGroup === "youngAdult") {
    if (goal === "cut") return 0.85;
    if (goal === "bulk") return 1.08;

    return 1;
  }

  /*
   * Ages 36+ use more conservative
   * starting adjustments.
   */

  if (goal === "cut") return 0.88;
  if (goal === "bulk") return 1.06;

  return 1;
}

function getGoalLabel(
  ageGroup: AgeGroup,
  goal: Goal
) {
  if (ageGroup === "youth") {
    return "MAINTAIN & DEVELOP";
  }

  if (goal === "cut") {
    return "FAT LOSS";
  }

  if (goal === "bulk") {
    return "LEAN BULK";
  }

  return "MAINTAIN";
}

function getFormulaLabel(
  gender: Gender,
  ageGroup: AgeGroup
) {
  const genderName =
    gender === "male" ? "MALE" : "FEMALE";

  if (ageGroup === "youth") {
    return `${genderName} YOUTH EER`;
  }

  return `${genderName} ADULT EER`;
}

function getProfileNote(
  gender: Gender,
  ageGroup: AgeGroup
) {
  if (ageGroup === "youth") {
    return gender === "male"
      ? "Male youth mode prioritises energy, growth and balanced nutrition."
      : "Female youth mode prioritises energy, growth and balanced nutrition.";
  }

  if (ageGroup === "youngAdult") {
    return gender === "male"
      ? "Male performance profile with sex-specific energy calculation."
      : "Female performance profile with sex-specific energy calculation.";
  }

  return gender === "male"
    ? "Male 36+ profile with conservative goal adjustment and recovery focus."
    : "Female 36+ profile with conservative goal adjustment and recovery focus.";
}

function calculateMacros({
  gender,
  ageGroup,
  goal,
  weight,
  calories,
}: {
  gender: Gender;
  ageGroup: AgeGroup;
  goal: Goal;
  weight: number;
  calories: number;
}) {
  let protein: number;
  let fat: number;

  /*
   * Youth uses a balanced percentage-based
   * macro distribution.
   */

  if (ageGroup === "youth") {
    protein = Math.round(
      (calories * 0.18) / 4
    );

    fat = Math.round(
      (calories * 0.3) / 9
    );
  } else {
    let proteinPerKg = 1.6;

    if (goal === "cut") {
      proteinPerKg = 2;
    }

    if (goal === "bulk") {
      proteinPerKg = 1.8;
    }

    /*
     * Slightly higher protein floor for
     * the broad 36+ group.
     */

    if (ageGroup === "adult36Plus") {
      proteinPerKg += 0.1;
    }

    protein = Math.round(
      weight * proteinPerKg
    );

    const minimumFatFromWeight =
      weight *
      (
        gender === "female"
          ? 0.85
          : 0.8
      );

    const minimumFatFromCalories =
      (calories * 0.22) / 9;

    fat = Math.round(
      Math.max(
        minimumFatFromWeight,
        minimumFatFromCalories
      )
    );
  }

  const proteinCalories = protein * 4;
  const fatCalories = fat * 9;

  const carbs = Math.max(
    0,
    Math.round(
      (
        calories -
        proteinCalories -
        fatCalories
      ) / 4
    )
  );

  return {
    protein,
    fat,
    carbs,
  };
}

/* =========================================================
   MEAL OUTPUT HELPERS
========================================================= */

function getMealLabel(
  index: number,
  totalMeals: number
) {
  if (index === 0) {
    return "BREAKFAST";
  }

  if (index === 1 && totalMeals >= 4) {
    return "POST-WORKOUT";
  }

  if (index === totalMeals - 1) {
    return "DINNER";
  }

  if (
    index === totalMeals - 2 &&
    totalMeals >= 5
  ) {
    return "SNACK";
  }

  return "MAIN MEAL";
}

function getMealExample(
  dietPreference: DietPreference,
  ageGroup: AgeGroup,
  index: number
): MealExample {
  const balancedMeals: MealExample[] = [
    {
      title: "OATS, YOGURT & FRUIT",
      foods:
        "Oats, Greek yogurt, milk, banana and frozen berries.",
    },
    {
      title: "CHICKEN, RICE & VEGETABLES",
      foods:
        "Chicken breast, rice, broccoli, carrots and seasoning.",
    },
    {
      title: "FISH, POTATO & SALAD",
      foods:
        "White fish, potatoes, cucumber, carrots and olive oil.",
    },
    {
      title: "YOGURT, FRUIT & RICE CAKES",
      foods:
        "Greek yogurt, fruit, rice cakes and a small amount of honey.",
    },
    {
      title: "LEAN BEEF & PASTA",
      foods:
        "Lean beef, pasta, vegetables and a light tomato sauce.",
    },
    {
      title: "EGGS, RICE & VEGETABLES",
      foods:
        "Eggs, rice, vegetables and a lean protein option.",
    },
  ];

  const highProteinMeals: MealExample[] = [
    {
      title: "PROTEIN OATS",
      foods:
        "Oats, whey protein, Greek yogurt, milk and berries.",
    },
    {
      title: "CHICKEN & RICE BOWL",
      foods:
        "Chicken breast, rice, vegetables and low-calorie seasoning.",
    },
    {
      title: "GREEK YOGURT PROTEIN BOWL",
      foods:
        "Greek yogurt, whey protein, fruit and rice cakes.",
    },
    {
      title: "LEAN BEEF & POTATO",
      foods:
        "Lean beef, potatoes and high-volume vegetables.",
    },
    {
      title: "WHITE FISH & RICE",
      foods:
        "White fish, rice, broccoli and carrots.",
    },
    {
      title: "EGG WHITE MEAL",
      foods:
        "Egg whites, whole egg, rice and vegetables.",
    },
  ];

  const lowFatMeals: MealExample[] = [
    {
      title: "OATS & FAT-FREE YOGURT",
      foods:
        "Oats, fat-free yogurt, skim milk and fruit.",
    },
    {
      title: "CHICKEN BREAST & RICE",
      foods:
        "Skinless chicken breast, rice and steamed vegetables.",
    },
    {
      title: "COD & POTATO",
      foods:
        "White fish, boiled potatoes and vegetables.",
    },
    {
      title: "WHEY & FRUIT",
      foods:
        "Whey protein, fruit, rice cakes and fat-free milk.",
    },
    {
      title: "LEAN TURKEY PASTA",
      foods:
        "Lean turkey, pasta and low-fat tomato sauce.",
    },
    {
      title: "EGG WHITES & RICE",
      foods:
        "Egg whites, rice, vegetables and seasoning.",
    },
  ];

  const vegetarianMeals: MealExample[] = [
    {
      title: "OATS, YOGURT & FRUIT",
      foods:
        "Oats, Greek yogurt, milk, banana and berries.",
    },
    {
      title: "TOFU & RICE BOWL",
      foods:
        "Tofu, rice, broccoli, carrots and soy-based seasoning.",
    },
    {
      title: "LENTIL PASTA",
      foods:
        "Lentil pasta, tomato sauce and mixed vegetables.",
    },
    {
      title: "YOGURT PROTEIN BOWL",
      foods:
        "Greek yogurt, protein powder, fruit and cereal.",
    },
    {
      title: "TEMPEH & POTATO",
      foods:
        "Tempeh, potatoes, vegetables and seasoning.",
    },
    {
      title: "EGGS, RICE & VEGETABLES",
      foods:
        "Eggs, rice, vegetables and a dairy protein option.",
    },
  ];

  let meals = balancedMeals;

  if (dietPreference === "highProtein") {
    meals = highProteinMeals;
  }

  if (dietPreference === "lowFat") {
    meals = lowFatMeals;
  }

  if (dietPreference === "vegetarian") {
    meals = vegetarianMeals;
  }

  const selectedMeal =
    meals[index % meals.length];

  if (ageGroup === "youth") {
    return {
      title: selectedMeal.title,
      foods:
        `${selectedMeal.foods} Portion size should support growth and normal daily activity.`,
    };
  }

  if (ageGroup === "adult36Plus") {
    return {
      title: selectedMeal.title,
      foods:
        `${selectedMeal.foods} Distribute protein evenly and prioritise digestible, high-fibre foods.`,
    };
  }

  return selectedMeal;
}

/* =========================================================
   PAGE
========================================================= */

export default function MealPlanPage() {
  const [gender, setGender] =
    useState<Gender>("male");

  const [ageGroup, setAgeGroup] =
    useState<AgeGroup>("youngAdult");

  const [age, setAge] =
    useState(
      AGE_GROUPS.youngAdult.defaultAge
    );

  const [height, setHeight] =
    useState(175);

  const [weight, setWeight] =
    useState(69);

  const [goal, setGoal] =
    useState<Goal>("maintain");

  const [activity, setActivity] =
    useState<ActivityLevel>("active");

  const [mealsPerDay, setMealsPerDay] =
    useState(4);

  const [
    dietPreference,
    setDietPreference,
  ] = useState<DietPreference>("balanced");

  const [generated, setGenerated] =
    useState(false);

  function handleAgeGroupChange(
    nextAgeGroup: AgeGroup
  ) {
    setAgeGroup(nextAgeGroup);

    setAge(
      AGE_GROUPS[nextAgeGroup].defaultAge
    );

    if (nextAgeGroup === "youth") {
      setGoal("maintain");
    }
  }

  function handleAgeChange(
    value: number
  ) {
    const configuration =
      AGE_GROUPS[ageGroup];

    const safeValue = Math.min(
      configuration.maxAge,
      Math.max(
        configuration.minAge,
        value
      )
    );

    setAge(safeValue);
  }

  const result =
    useMemo<MacroResult>(() => {
      const maintenanceCalories =
        calculateMaintenanceCalories({
          gender,
          age,
          ageGroup,
          heightCm: height,
          weightKg: weight,
          activity,
        });

      const goalMultiplier =
        getGoalMultiplier(
          ageGroup,
          goal
        );

      const targetCalories = Math.max(
        1000,
        Math.round(
          maintenanceCalories *
            goalMultiplier
        )
      );

      const macros = calculateMacros({
        gender,
        ageGroup,
        goal,
        weight,
        calories: targetCalories,
      });

      return {
        maintenanceCalories: Math.round(
          maintenanceCalories
        ),

        targetCalories,

        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,

        genderLabel:
          gender === "male"
            ? "MALE"
            : "FEMALE",

        ageGroupLabel:
          AGE_GROUPS[ageGroup].label,

        formulaLabel:
          getFormulaLabel(
            gender,
            ageGroup
          ),

        goalLabel:
          getGoalLabel(
            ageGroup,
            goal
          ),

        profileNote:
          getProfileNote(
            gender,
            ageGroup
          ),
      };
    }, [
      gender,
      age,
      ageGroup,
      height,
      weight,
      goal,
      activity,
    ]);

  function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setGenerated(true);

    window.setTimeout(() => {
      document
        .getElementById("generated-plan")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 100);
  }

  return (
    <main className={styles.page}>
      <div className={styles.background} />
      <div className={styles.overlay} />
      <div className={styles.grid} />

      {/* NAVBAR */}

      <header className={styles.navbar}>
        <Link
          href="/"
          className={styles.logo}
        >
          MUSCLE FITNESS
        </Link>

        <nav className={styles.nav}>
          <Link href="/">HOME</Link>

          <Link href="/story">
            MY STORY
          </Link>

          <Link href="/meal-plan">
            MEAL PLAN
          </Link>

          <Link href="/training">
            TRAINING
          </Link>

          <Link href="/dashboard">
            DASHBOARD
          </Link>
        </nav>
      </header>

      {/* HERO */}

      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.chapter}>
            <span>03</span>
            <i />
            <span>NUTRITION SYSTEM</span>
          </div>

          <p className={styles.eyebrow}>
            BUILT AROUND YOUR BODY
          </p>

          <h1>
            STOP GUESSING
            <br />
            WHAT TO EAT.
            <br />
            <span>BUILD A SYSTEM.</span>
          </h1>

          <p
            className={
              styles.heroDescription
            }
          >
            A sex-specific and age-aware
            starting nutrition system built
            around your body, activity,
            objective and meal preference.
          </p>

          <a
            href="#calculator"
            className={styles.heroButton}
          >
            BUILD MY PLAN
            <span>↓</span>
          </a>
        </div>

        <div className={styles.heroStats}>
          <div>
            <strong>01</strong>
            <span>SELECT PROFILE</span>
          </div>

          <div>
            <strong>02</strong>
            <span>CALCULATE</span>
          </div>

          <div>
            <strong>03</strong>
            <span>STRUCTURE</span>
          </div>

          <div>
            <strong>04</strong>
            <span>EXECUTE</span>
          </div>
        </div>
      </section>

      {/* CALCULATOR */}

      <section
        className={styles.calculator}
        id="calculator"
      >
        <div
          className={
            styles.calculatorHeading
          }
        >
          <div className={styles.chapter}>
            <span>01</span>
            <i />
            <span>PERSONAL DATA</span>
          </div>

          <h2>
            YOUR BODY.
            <br />
            YOUR PROFILE.
            <br />
            <span>YOUR NUMBERS.</span>
          </h2>

          <p>
            Choose the correct sex and age
            category, then enter your exact
            body data. The calculation changes
            automatically for Male, Female and
            each age group.
          </p>
        </div>

        <form
          className={styles.form}
          onSubmit={handleSubmit}
        >
          {/* SEX */}

          <section
            className={styles.formSection}
          >
            <div
              className={
                styles.formSectionHeader
              }
            >
              <span>01</span>

              <div>
                <h3>
                  BIOLOGICAL SEX
                </h3>

                <p>
                  Select the calculation
                  profile used for energy
                  estimation.
                </p>
              </div>
            </div>

            <div
              className={styles.genderGrid}
            >
              <label
                className={`${styles.genderCard} ${
                  gender === "male"
                    ? styles.selectedCard
                    : ""
                }`}
              >
                <input
                  type="radio"
                  name="gender"
                  value="male"
                  checked={
                    gender === "male"
                  }
                  onChange={() =>
                    setGender("male")
                  }
                />

                <span>01</span>

                <h4>MALE</h4>

                <p>
                  Uses the Male EER profile
                  and Male activity
                  coefficients.
                </p>

                <i
                  className={
                    styles.cardCheck
                  }
                />
              </label>

              <label
                className={`${styles.genderCard} ${
                  gender === "female"
                    ? styles.selectedCard
                    : ""
                }`}
              >
                <input
                  type="radio"
                  name="gender"
                  value="female"
                  checked={
                    gender === "female"
                  }
                  onChange={() =>
                    setGender("female")
                  }
                />

                <span>02</span>

                <h4>FEMALE</h4>

                <p>
                  Uses the Female EER profile
                  and Female activity
                  coefficients.
                </p>

                <i
                  className={
                    styles.cardCheck
                  }
                />
              </label>
            </div>
          </section>

          {/* AGE GROUP */}

          <section
            className={styles.formSection}
          >
            <div
              className={
                styles.formSectionHeader
              }
            >
              <span>02</span>

              <div>
                <h3>AGE CATEGORY</h3>

                <p>
                  Select the stage that
                  matches the client.
                </p>
              </div>
            </div>

            <div
              className={
                styles.ageGroupGrid
              }
            >
              {AGE_GROUP_ORDER.map(
                (group) => {
                  const configuration =
                    AGE_GROUPS[group];

                  return (
                    <label
                      key={group}
                      className={`${styles.ageGroupCard} ${
                        ageGroup === group
                          ? styles.ageGroupSelected
                          : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="ageGroup"
                        value={group}
                        checked={
                          ageGroup === group
                        }
                        onChange={() =>
                          handleAgeGroupChange(
                            group
                          )
                        }
                      />

                      <span>
                        {
                          configuration.label
                        }
                      </span>

                      <strong>
                        {
                          configuration.title
                        }
                      </strong>

                      <small>
                        {
                          configuration.description
                        }
                      </small>
                    </label>
                  );
                }
              )}
            </div>
          </section>

          {/* BODY INFORMATION */}

          <section
            className={styles.formSection}
          >
            <div
              className={
                styles.formSectionHeader
              }
            >
              <span>03</span>

              <div>
                <h3>
                  BODY INFORMATION
                </h3>

                <p>
                  Enter the client&apos;s
                  exact physical starting
                  point.
                </p>
              </div>
            </div>

            <div
              className={styles.fieldGrid}
            >
              <div className={styles.field}>
                <label htmlFor="age">
                  EXACT AGE — YEARS
                </label>

                <input
                  id="age"
                  type="number"
                  min={
                    AGE_GROUPS[ageGroup]
                      .minAge
                  }
                  max={
                    AGE_GROUPS[ageGroup]
                      .maxAge
                  }
                  value={age}
                  onChange={(event) =>
                    handleAgeChange(
                      Number(
                        event.target.value
                      )
                    )
                  }
                  required
                />

                <small>
                  Allowed range:{" "}
                  {
                    AGE_GROUPS[ageGroup]
                      .minAge
                  }
                  {"–"}
                  {
                    AGE_GROUPS[ageGroup]
                      .maxAge
                  }
                </small>
              </div>

              <div className={styles.field}>
                <label htmlFor="height">
                  HEIGHT — CM
                </label>

                <input
                  id="height"
                  type="number"
                  min={100}
                  max={230}
                  value={height}
                  onChange={(event) =>
                    setHeight(
                      Number(
                        event.target.value
                      )
                    )
                  }
                  required
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="weight">
                  WEIGHT — KG
                </label>

                <input
                  id="weight"
                  type="number"
                  min={20}
                  max={300}
                  step="0.1"
                  value={weight}
                  onChange={(event) =>
                    setWeight(
                      Number(
                        event.target.value
                      )
                    )
                  }
                  required
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="activity">
                  ACTIVITY LEVEL
                </label>

                <select
                  id="activity"
                  value={activity}
                  onChange={(event) =>
                    setActivity(
                      event.target
                        .value as ActivityLevel
                    )
                  }
                >
                  <option value="sedentary">
                    Sedentary
                  </option>

                  <option value="lowActive">
                    Low active
                  </option>

                  <option value="active">
                    Active
                  </option>

                  <option value="veryActive">
                    Very active / intense
                  </option>
                </select>
              </div>
            </div>
          </section>

          {/* GOAL */}

          <section
            className={styles.formSection}
          >
            <div
              className={
                styles.formSectionHeader
              }
            >
              <span>04</span>

              <div>
                <h3>YOUR OBJECTIVE</h3>

                <p>
                  Select the direction of
                  the nutrition plan.
                </p>
              </div>
            </div>

            <div
              className={styles.goalGrid}
            >
              <label
                className={`${styles.goalCard} ${
                  goal === "cut"
                    ? styles.selected
                    : ""
                } ${
                  ageGroup === "youth"
                    ? styles.disabledCard
                    : ""
                }`}
              >
                <input
                  type="radio"
                  name="goal"
                  value="cut"
                  checked={goal === "cut"}
                  disabled={
                    ageGroup === "youth"
                  }
                  onChange={() =>
                    setGoal("cut")
                  }
                />

                <span>01</span>

                <h4>FAT LOSS</h4>

                <p>
                  Controlled calorie deficit
                  while preserving performance
                  and muscle.
                </p>
              </label>

              <label
                className={`${styles.goalCard} ${
                  goal === "maintain"
                    ? styles.selected
                    : ""
                }`}
              >
                <input
                  type="radio"
                  name="goal"
                  value="maintain"
                  checked={
                    goal === "maintain"
                  }
                  onChange={() =>
                    setGoal("maintain")
                  }
                />

                <span>02</span>

                <h4>
                  {ageGroup === "youth"
                    ? "MAINTAIN & DEVELOP"
                    : "MAINTAIN"}
                </h4>

                <p>
                  Support daily energy,
                  performance, recovery and
                  stable body weight.
                </p>
              </label>

              <label
                className={`${styles.goalCard} ${
                  goal === "bulk"
                    ? styles.selected
                    : ""
                } ${
                  ageGroup === "youth"
                    ? styles.disabledCard
                    : ""
                }`}
              >
                <input
                  type="radio"
                  name="goal"
                  value="bulk"
                  checked={
                    goal === "bulk"
                  }
                  disabled={
                    ageGroup === "youth"
                  }
                  onChange={() =>
                    setGoal("bulk")
                  }
                />

                <span>03</span>

                <h4>LEAN BULK</h4>

                <p>
                  Controlled calorie surplus
                  for strength and muscle
                  development.
                </p>
              </label>
            </div>

            {ageGroup === "youth" && (
              <div
                className={
                  styles.safetyNotice
                }
              >
                <span>YOUTH MODE</span>

                <p>
                  Ages 6–18 use a
                  maintenance and
                  development-oriented
                  estimate. Automatic cutting
                  and bulking targets are
                  disabled.
                </p>
              </div>
            )}
          </section>

          {/* FOOD STRUCTURE */}

          <section
            className={styles.formSection}
          >
            <div
              className={
                styles.formSectionHeader
              }
            >
              <span>05</span>

              <div>
                <h3>
                  MEAL STRUCTURE
                </h3>

                <p>
                  Choose the number of meals
                  and preferred eating style.
                </p>
              </div>
            </div>

            <div
              className={styles.fieldGrid}
            >
              <div className={styles.field}>
                <label htmlFor="meals">
                  MEALS PER DAY
                </label>

                <select
                  id="meals"
                  value={mealsPerDay}
                  onChange={(event) =>
                    setMealsPerDay(
                      Number(
                        event.target.value
                      )
                    )
                  }
                >
                  <option value={2}>
                    2 meals
                  </option>

                  <option value={3}>
                    3 meals
                  </option>

                  <option value={4}>
                    4 meals
                  </option>

                  <option value={5}>
                    5 meals
                  </option>

                  <option value={6}>
                    6 meals
                  </option>
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="diet">
                  DIET PREFERENCE
                </label>

                <select
                  id="diet"
                  value={dietPreference}
                  onChange={(event) =>
                    setDietPreference(
                      event.target
                        .value as DietPreference
                    )
                  }
                >
                  <option value="balanced">
                    Balanced
                  </option>

                  <option value="highProtein">
                    High protein
                  </option>

                  <option value="lowFat">
                    Low fat
                  </option>

                  <option value="vegetarian">
                    Vegetarian
                  </option>
                </select>
              </div>
            </div>
          </section>

          {/* PROFILE SUMMARY */}

          <div
            className={styles.profileStrip}
          >
            <div>
              <span>CLIENT PROFILE</span>

              <strong>
                {result.genderLabel}
                {" · "}
                {result.ageGroupLabel}
                {" · "}
                {age} YEARS
              </strong>
            </div>

            <div>
              <span>
                CALCULATION MODEL
              </span>

              <strong>
                {result.formulaLabel}
              </strong>
            </div>

            <div>
              <span>OBJECTIVE</span>

              <strong>
                {result.goalLabel}
              </strong>
            </div>
          </div>

          <p className={styles.estimateNote}>
            {result.profileNote}
          </p>

          {/* LIVE RESULT */}

          <div
            className={styles.livePreview}
          >
            <div>
              <span>MAINTENANCE</span>

              <strong>
                {result.maintenanceCalories.toLocaleString()}
              </strong>

              <small>KCAL</small>
            </div>

            <div>
              <span>TARGET CALORIES</span>

              <strong>
                {result.targetCalories.toLocaleString()}
              </strong>

              <small>KCAL</small>
            </div>

            <div>
              <span>PROTEIN</span>

              <strong>
                {result.protein}
              </strong>

              <small>G</small>
            </div>

            <div>
              <span>CARBOHYDRATES</span>

              <strong>
                {result.carbs}
              </strong>

              <small>G</small>
            </div>

            <div>
              <span>FAT</span>

              <strong>
                {result.fat}
              </strong>

              <small>G</small>
            </div>
          </div>

          <button
            type="submit"
            className={styles.submitButton}
          >
            GENERATE MY MEAL PLAN
            <span>→</span>
          </button>
        </form>
      </section>

      {generated && (
        <GeneratedPlan
          result={result}
          gender={gender}
          ageGroup={ageGroup}
          exactAge={age}
          mealsPerDay={mealsPerDay}
          dietPreference={
            dietPreference
          }
        />
      )}
    </main>
  );
}

/* =========================================================
   GENERATED PLAN
========================================================= */

function GeneratedPlan({
  result,
  gender,
  ageGroup,
  exactAge,
  mealsPerDay,
  dietPreference,
}: {
  result: MacroResult;
  gender: Gender;
  ageGroup: AgeGroup;
  exactAge: number;
  mealsPerDay: number;
  dietPreference: DietPreference;
}) {
  const distribution =
    MEAL_DISTRIBUTIONS[mealsPerDay] ??
    Array.from({
      length: mealsPerDay,
    }).map(() => 1 / mealsPerDay);

  return (
    <section
      className={styles.generatedPlan}
      id="generated-plan"
    >
      <div
        className={styles.generatedHeader}
      >
        <div className={styles.chapter}>
          <span>02</span>
          <i />
          <span>GENERATED PLAN</span>
        </div>

        <h2>
          EAT WITH
          <br />
          <span>STRUCTURE.</span>
        </h2>

        <p>
          A starting plan for a{" "}
          {gender === "male"
            ? "Male"
            : "Female"}{" "}
          client, age {exactAge}, using the{" "}
          {AGE_GROUPS[ageGroup].label}{" "}
          profile.
        </p>
      </div>

      <div className={styles.summaryBar}>
        <div>
          <span>PROFILE</span>

          <strong>
            {result.genderLabel}
          </strong>

          <small>
            {result.ageGroupLabel}
          </small>
        </div>

        <div>
          <span>CALORIES</span>

          <strong>
            {result.targetCalories}
          </strong>

          <small>KCAL</small>
        </div>

        <div>
          <span>PROTEIN</span>

          <strong>
            {result.protein}
          </strong>

          <small>G</small>
        </div>

        <div>
          <span>CARBS</span>

          <strong>
            {result.carbs}
          </strong>

          <small>G</small>
        </div>

        <div>
          <span>FAT</span>

          <strong>
            {result.fat}
          </strong>

          <small>G</small>
        </div>
      </div>

      <div className={styles.generatedGrid}>
        {distribution.map(
          (percentage, index) => {
            const mealCalories =
              Math.round(
                result.targetCalories *
                  percentage
              );

            const mealProtein =
              Math.round(
                result.protein *
                  percentage
              );

            const mealCarbs =
              Math.round(
                result.carbs *
                  percentage
              );

            const mealFat =
              Math.round(
                result.fat *
                  percentage
              );

            const meal =
              getMealExample(
                dietPreference,
                ageGroup,
                index
              );

            return (
              <article
                className={
                  styles.generatedMeal
                }
                key={`${index}-${meal.title}`}
              >
                <div
                  className={
                    styles.generatedMealTop
                  }
                >
                  <span>
                    MEAL{" "}
                    {String(
                      index + 1
                    ).padStart(2, "0")}
                  </span>

                  <span>
                    {getMealLabel(
                      index,
                      mealsPerDay
                    )}
                  </span>
                </div>

                <h3>{meal.title}</h3>

                <p>{meal.foods}</p>

                <div
                  className={
                    styles.generatedMealMacros
                  }
                >
                  <div>
                    <strong>
                      {mealCalories}
                    </strong>

                    <span>KCAL</span>
                  </div>

                  <div>
                    <strong>
                      {mealProtein}
                    </strong>

                    <span>P</span>
                  </div>

                  <div>
                    <strong>
                      {mealCarbs}
                    </strong>

                    <span>C</span>
                  </div>

                  <div>
                    <strong>
                      {mealFat}
                    </strong>

                    <span>F</span>
                  </div>
                </div>
              </article>
            );
          }
        )}
      </div>

      <div className={styles.planActions}>
        <button type="button">
          SAVE TO DASHBOARD
          <span>→</span>
        </button>

        <button type="button">
          GENERATE SHOPPING LIST
        </button>
      </div>

      <p className={styles.finalNotice}>
        This is an estimated starting point,
        not a medical prescription. Youth
        nutrition, pregnancy, breastfeeding,
        medical conditions and eating
        disorders require appropriate
        professional guidance.
      </p>
    </section>
  );
}