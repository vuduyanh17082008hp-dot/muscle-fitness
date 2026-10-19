export default async ({ page, go, snap, jl }) => {
  await go('/dashboard'); const dsh = await snap('dash')
  jl({ dashCard: (dsh.match(/(SESSION COMPLETE|WORKOUT COMPLETE|COMPLETED|TODAY'S TRAINING|SESSION IN PROGRESS|SCHEDULED REST DAY)[\s\S]{0,220}/) ?? [dsh.slice(0, 250)])[0], whatMatters: (dsh.match(/WHAT MATTERS NOW[\s\S]{0,260}/) ?? [''])[0], brief: (dsh.match(/DANTE DAILY BRIEF[\s\S]{0,300}/) ?? [''])[0], recent: (dsh.match(/RECENT ACTIVITY[\s\S]{0,200}/) ?? [''])[0] })
  await go('/dashboard/recovery'); const rec = await snap('recovery')
  jl({ recTrainingCard: (rec.match(/TRAINING × RECOVERY[\s\S]{0,260}/) ?? [''])[0] })
  await go('/dashboard/nutrition'); const nut = await snap('nutrition')
  jl({ nutritionMentionsWorkout: /workout|training|post-?workout|session/i.test(nut.slice(0, 3000)), best: (nut.match(/BEST NEXT OPTION[\s\S]{0,200}/) ?? [''])[0] })
  await go('/dashboard/progress'); const pr = await snap('progress')
  jl({ progressTop: pr.slice(0, 450) })
}
