Add-Type -AssemblyName System.Speech
$outputDir = "C:\Dev\Projects\muscle-fitness-claude\output\audio_slides"
if (!(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

$slides = @(
    "Fitness information is everywhere. Good decisions aren't. That's the problem we're solving. Welcome to Muscle Fitness, where fragmented data becomes intelligent, safe, personalized direction.",
    "Our platform hits four key pillars: physical wellbeing, economic accessibility, linguistic inclusion, and evidence-informed impact. Translation? We're bringing personal coaching to people who can't afford a hundred bucks an hour for a human trainer. Because good guidance shouldn't be a luxury.",
    "Here's the modern athlete's dilemma. Training logs in one app. Calories in another. Generic chatbots hallucinating workouts like they're on a bad trip. Social media pushing contradictory advice. And the user? Stuck in the middle, paralyzed. It's like trying to navigate a storm with ten maps and no compass.",
    "We build for beginners, busy students, everyday gym goers, multilingual users, and anyone intimidated by complex jargon. They don't need raw numbers. They need empathetic, clear direction. Someone to say, Hey, you got this. Here's your next step.",
    "Muscle Fitness unifies Training, Nutrition, Recovery, and Progress into a single context engine, powered by Dante, our specialized AI coaching layer. One context. One coach. Better decisions.",
    "This is our signature orbital architecture. At the core sits Dante. Orbiting Dante are the four operational pillars: Training, Nutrition, Recovery, and Progress, all encircled by rich user profile, goal, and fatigue context. Think of it as a solar system where every planet speaks the same language.",
    "Muscle Fitness is a live, production-ready full-stack application built with Next.js 16, Supabase, and custom deterministic safety rules. Everything you see today is fully functional. No mockups. No smoke and mirrors. Just real code doing real work.",
    "An athlete sets up their profile, checks daily readiness on the dashboard, logs workouts and macro fuel, monitors recovery, and receives instant, safe coaching adjustments from Dante. From context to action, smooth as butter.",
    "Dante is not a generic ChatGPT wrapper or a mascot. Dante is an active intelligence node with persistent memory of athlete fatigue, historical volume, dietary goals, and physical limitations. It remembers. It adapts. It cares, well, as much as code can care.",
    "Generic AI feeds unconstrained prompts directly to an LLM, leading to workout hallucinations and dangerous injury advice. Dante passes user intent through scope filters, evidence gates, and clinical safety checks before generating a single word. The model is not the system. The system is the safety net.",
    "We enforce strict evidence tiers. Public knowledge is allowed. User state claims require logged data. Specific readiness claims require hard telemetry. Any unsupported physiological claim is automatically intercepted. Personal claims need evidence. Period.",
    "If a user says My knee hurts, a generic LLM might diagnose a torn ACL. Dante explicitly refuses medical diagnosis, advises resting the joint, suggests painless variations, and recommends consulting a licensed professional. Safe enough to know its limits.",
    "Dante adapts communication dynamically, offering plain language, multilingual support, and verbosity controls. Crucially: hiding complex charts does not mean hiding data from the coaching engine. Same truth. Better communication.",
    "Our architecture combines Next.js App Router, Supabase Auth with Row Level Security, local state persistence, and deterministic AI guardrails. AI inside a controlled product system.",
    "Five safety rings surround Dante on every turn: Context, Evidence, Decision, Safety, and Communication Adaptation. Personalized doesn't mean uncontrolled.",
    "Our zero-breaking-change adapter layer allows instant expansion. Here are two expansion modules ready for future reveal without altering core safety guarantees. Built to adapt without breaking the core.",
    "We bridge the gap when human trainers are unavailable. We proudly display Validation in progress as empirical user testing continues. Responsible guidance when a trainer isn't available.",
    "We are not trying to replace personal trainers. We are making responsible, personalized fitness guidance accessible when one isn't there. Muscle Fitness: Train Smarter. Decide Better. Thank you."
)

for ($i = 0; $i -lt $slides.Count; $i++) {
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $synth.Rate = 0
    $idxStr = ($i + 1).ToString("D2")
    $filePath = Join-Path $outputDir "slide_${idxStr}.wav"
    $synth.SetOutputToWaveFile($filePath)
    $synth.Speak($slides[$i])
    $synth.Dispose()
    Write-Host "Synthesized audio for slide $idxStr -> $filePath"
}
