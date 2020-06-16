/** @format */

const $: (q: string) => HTMLElement = (q: string) =>
	document.querySelector(q) ||
	(function () {
		throw new Error("Could not find element " + q)
	})()

const hashFragment: {[param: string]: string} = location.hash
	.substr(1)
	.split("&")
	.reduce((hash: any, str) => {
		const s = str.split("=")
		if (s.length === 2) {
			hash[s[0]] = s[1]
		}
		return hash
	}, {})

console.log(hashFragment)

/** Random number generator. */
const random = (a: number, b?: number) => (b ? Math.random() * (b - a) + a : Math.random() * a)

const applyTemplate = ($element: HTMLElement, data: any) => {
	// TODO: Rewrite this entire thing
	// @ts-ignore
	if (!$element._template) $element._template = $element.innerHTML
	// @ts-ignore
	$element.innerHTML = $element._template
	Object.keys(data).forEach((key) => ($element.innerHTML = $element.innerHTML.split("{" + key + "}").join(data[key])))
}

interface Star {
	px: number
	py: number
	vx: number
	vy: number
	extraSpeedY: number
	extraSpeedX: number
	extraSpeedResistance: number
	alpha: number
	color: string
}

interface ConnectionStar extends Star {
	connectionRadius: number
	connectionOpacity: number
}

function isConnectionStar(star: Star): star is ConnectionStar {
	return "connectionRadius" in star
}

/** Class to handle drawing of things to the canvas. */
abstract class XCanvas {
	public canvas = document.createElement("canvas")
	protected ctx: CanvasRenderingContext2D

	protected left: number = 0
	protected right: number = this.canvas.width
	protected bottom: number = this.canvas.height
	protected top: number = 0
	protected scale: number = window.devicePixelRatio || 1

	private lastT = 0
	private lastWidth = window.innerWidth
	private lastHeight = window.innerHeight
	private lastFPSRead = performance.now()
	protected fps = 0

	abstract resize(lastWidth: number, lastHeight: number, newWidth: number, newHeight: number): void

	private drawHook: FrameRequestCallback = (t: number) => {
		const deltaT = t - this.lastT
		if (t > this.lastFPSRead + 500) {
			this.fps = (16.67 / deltaT) * 60
			this.lastFPSRead = t
		}
		this.draw(t, deltaT, this.ctx)
		this.lastT = t
		requestAnimationFrame(this.drawHook)
	}

	constructor() {
		const ctx = this.canvas.getContext("2d")
		if (!ctx) throw new Error("Could not get 2D rendering context.")
		this.ctx = ctx

		window.addEventListener("resize", () => {
			const newHeight = window.innerHeight
			const newWidth = window.innerWidth
			if (newHeight !== this.lastHeight || newWidth !== this.lastWidth) {
				this.layout()
				this.resize(this.lastWidth, this.lastHeight, newWidth, newHeight)
				this.lastWidth = newWidth
				this.lastHeight = newHeight
			}
		})
	}

	public start() {
		this.layout()
		requestAnimationFrame(this.drawHook)
	}

	private layout() {
		const box = this.canvas.getBoundingClientRect()
		const width = box.width
		const height = box.height
		this.scale = window.devicePixelRatio || 1
		this.canvas.width = Math.floor(width * this.scale)
		this.canvas.height = Math.floor(height * this.scale)

		// this.left = 0
		this.right = this.canvas.width
		this.bottom = this.canvas.height
		// this.top = 0

		// Normalize coordinate system to use css pixels (see https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio)
		this.ctx.scale(this.scale, this.scale)
	}

	abstract draw(t: number, deltaT: number, ctx: CanvasRenderingContext2D): void
}

class StarfieldOptions {
	STAR_RADIUS = 1
	MIN_CONNECTION_RADIUS = 60
	MAX_CONNECTION_RADIUS = 200
	FADE_OUT_PADDING = 100
	// maximumStarPopulation = 200
	starPopulationDensity = 0.000055
	drawDebug = true
	starMinSpeed = 1.5
	starMaxSpeed = 1.7
	worldSpeed = 0.5
	/** Number of connection stars per pixel on the screen. */
	connectionStarPopulationDensity = 0.00002
	showKeyboardShortcuts = false
}

class Starfield extends XCanvas {
	maximumStarPopulation = Math.floor(window.innerHeight * window.innerWidth * this.options.starPopulationDensity)
	maxConnectionStars = Math.floor(window.innerHeight * window.innerWidth * this.options.connectionStarPopulationDensity)
	connectionRadiusProduct = 1
	nStars = 0
	nConnectionStars = 0
	nLines = 0
	stars: Star[] = []
	connectionStars: ConnectionStar[] = []
	/** Star colors will be drawn from this array randomly. Expects `r,g,b` formatting (`0,0,0` - `255,255,255`). */
	pallette: string[] = []

	private secretKeyboardShortcuts(e: {key: string}) {
		// You found the secret keyboard shortcuts!
		const opt = this.options

		if (e.key === "F1") opt.showKeyboardShortcuts = !opt.showKeyboardShortcuts

		// Control speed
		if (e.key === "i") opt.worldSpeed = opt.worldSpeed - 0.1
		if (e.key === "o") opt.worldSpeed = opt.worldSpeed + 0.1
		if (e.key === "=") opt.starMaxSpeed += 0.1
		if (e.key === "-") opt.starMaxSpeed -= 0.1
		if (e.key === "]") opt.starMinSpeed += 1
		if (e.key === "[") opt.starMinSpeed -= 1

		// Control populations, this is done automatically on load
		if (e.key === "j") this.maxConnectionStars--
		if (e.key === "k") this.maxConnectionStars++
		if (e.key === "z") this.maximumStarPopulation--
		if (e.key === "x") this.maximumStarPopulation++

		// Misc.
		if (e.key === "d") opt.drawDebug = !opt.drawDebug
		if (e.key === "h") $("main").hidden = !$("main").hidden

		// Navigation
		if (e.key === "f") document.fullscreen ? document.exitFullscreen() : document.body.requestFullscreen()
		if (e.key === "r") location.reload()
	}

	private secretKeyboardShortcutLines = this.secretKeyboardShortcuts.toString().split("\n")

	constructor(private options: StarfieldOptions = new StarfieldOptions()) {
		super()

		window.addEventListener("keydown", (e) => this.secretKeyboardShortcuts(e))
		// ...
	}

	draw(t: number, deltaT: number, ctx: CanvasRenderingContext2D) {
		const lagModifier = deltaT / 16.67

		this.nLines = 0
		this.canvas.width = this.canvas.width // this clears the canvas

		for (let i = this.nStars - 1; i >= 0; i--) {
			const star = this.stars[i]
			star.px += star.vx * this.options.worldSpeed * lagModifier
			star.py += star.vy * this.options.worldSpeed * lagModifier

			if (star.extraSpeedY || star.extraSpeedX) {
				if (star.extraSpeedX > 0) {
					star.extraSpeedX = Math.max(star.extraSpeedX - star.extraSpeedResistance * this.options.worldSpeed * lagModifier, 0)
					// star.extraSpeedX = Math.max(star.extraSpeedX, 0)
				} else if (star.extraSpeedX < 0) {
					star.extraSpeedX = Math.min(star.extraSpeedX + star.extraSpeedResistance * this.options.worldSpeed * lagModifier, 0)
				}

				if (star.extraSpeedY > 0) {
					star.extraSpeedY = Math.max(star.extraSpeedY - star.extraSpeedResistance * this.options.worldSpeed * lagModifier, 0)
				} else if (star.extraSpeedY < 0) {
					star.extraSpeedY = Math.min(star.extraSpeedY + star.extraSpeedResistance * this.options.worldSpeed * lagModifier, 0)
				}

				star.px += star.extraSpeedX * this.options.worldSpeed * lagModifier
				star.py += star.extraSpeedY * this.options.worldSpeed * lagModifier
			}

			// remove from loop if out of bounds
			if (star.px + this.options.STAR_RADIUS > this.right || star.px - this.options.STAR_RADIUS < this.left || star.py + this.options.STAR_RADIUS > this.bottom || star.py - this.options.STAR_RADIUS < this.top) {
				if (isConnectionStar(star)) {
					for (let csi = this.nConnectionStars - 1; csi >= 0; csi--) {
						if (this.connectionStars[csi] === star) {
							this.connectionStars.splice(csi, 1)
							continue
						}
					}
					this.nConnectionStars--
				}
				this.stars.splice(i, 1)
				this.nStars--
				continue
			}

			let alpha = 1

			// find the distance from the closest edge
			if (star.px < this.options.FADE_OUT_PADDING) {
				alpha = Math.min(alpha, star.px / this.options.FADE_OUT_PADDING)
			}

			if (star.py < this.options.FADE_OUT_PADDING) {
				alpha = Math.min(alpha, star.py / this.options.FADE_OUT_PADDING)
			}

			const rightAlphaEdge = this.canvas.width - this.options.FADE_OUT_PADDING
			if (star.px > rightAlphaEdge) {
				alpha = 1 - (star.px - rightAlphaEdge) / (this.canvas.width - rightAlphaEdge)
			}
			const bottomAlphaEdge = this.canvas.height - this.options.FADE_OUT_PADDING
			if (star.py > bottomAlphaEdge) {
				alpha = 1 - (star.py - bottomAlphaEdge) / (this.canvas.height - bottomAlphaEdge)
			}

			this.ctx.beginPath()
			this.ctx.arc(star.px, star.py, this.options.STAR_RADIUS, 0, 2 * Math.PI)

			alpha = alpha // * lagModifier
			this.ctx.fillStyle = `rgba(150,150,150,${alpha})`
			star.alpha = alpha
			this.ctx.fill()

			// let radius = star.connectionRadius
			if (isConnectionStar(star)) {
				let radius = star.connectionRadius
				radius = radius * this.connectionRadiusProduct
				for (let i2 = this.nStars - 1; i2 >= 0; i2--) {
					const star2 = this.stars[i2]
					if (star2.px < star.px + radius && star2.px > star.px - radius && star2.py > star.py - radius && star2.py < star.py + radius) {
						star.connectionOpacity = Math.min(1, (star.connectionOpacity || 0) + 0.0005 * lagModifier)

						const dx = star.px - star2.px
						const dy = star.py - star2.py
						const dt = Math.sqrt(dx * dx + dy * dy)
						const lineAlpha = Math.min(star2.alpha, Math.min(alpha, Math.min(1 - dt / radius, star.connectionOpacity)))

						if (dt < radius + this.options.STAR_RADIUS) {
							this.ctx.beginPath()
							this.ctx.lineTo(star.px, star.py)
							this.ctx.strokeStyle = `rgba(${star.color}, ${lineAlpha})`
							this.ctx.lineTo(star2.px, star2.py)
							this.ctx.stroke()
							this.nLines++
						}
					}
				}
			}
		}

		if (this.options.showKeyboardShortcuts || this.options.drawDebug) {
			this.ctx.font = "12px monospace"
			this.ctx.fillStyle = "white"
		}

		if (this.options.drawDebug) {
			this.ctx.fillText(`${this.canvas.width}x${this.canvas.height}@${this.scale} at ~${this.fps.toFixed(2)}FPS. ${this.nStars}/${this.maximumStarPopulation} stars total, including ${this.nConnectionStars}/${this.maxConnectionStars} connectors with ${this.nLines} active connections, spawning stars with speeds between ${this.options.starMinSpeed} - ${this.options.starMaxSpeed} (global: ${this.options.worldSpeed}). ~ops./frame: ${this.nStars * (1 + this.nConnectionStars)}`, 12, 12)
		}

		if (this.options.showKeyboardShortcuts) for (let i = 0, y = 48 * 3; i < this.secretKeyboardShortcutLines.length; i++, y += 12) this.ctx.fillText(this.secretKeyboardShortcutLines[i], 12, y)
	}

	resize(lastWidth: number, lastHeight: number, newWidth: number, newHeight: number) {
		if (newWidth !== lastWidth) {
			for (let i = this.nStars - 1; i >= 0; i--) {
				const star = this.stars[i]
				const xDiff = newWidth - lastWidth
				star.px += xDiff / 2
			}
		}

		if (newHeight !== lastHeight) {
			for (let i = this.nStars - 1; i >= 0; i--) {
				const star = this.stars[i]
				const yDiff = newHeight - lastHeight
				star.py += yDiff / 2
			}
		}

		this.maxConnectionStars = Math.floor(newWidth * newHeight * this.options.connectionStarPopulationDensity)
		this.maximumStarPopulation = Math.floor(newWidth * newHeight * this.options.starPopulationDensity)
	}

	private generateStarSpeed(max = this.options.starMaxSpeed, min = this.options.starMinSpeed) {
		const number = Math.floor(Math.random() * max) + min
		return Math.random() > 0.5 ? number : -number
	}

	private generateStarColor(): string {
		return this.pallette[Math.floor(Math.random() * this.pallette.length)]
	}

	public addStar(px = this.canvas.width * Math.random(), py = this.canvas.width * Math.random(), vx = this.generateStarSpeed(), vy = this.generateStarSpeed()) {
		// if (!section) debugger //. don't add a star if not running on a section yet!
		const star: Star = {px, py, vx, vy, color: this.generateStarColor(), extraSpeedY: 0, extraSpeedX: 0, extraSpeedResistance: 0, alpha: 0}
		this.stars.push(star)
		this.nStars++
		return star
	}

	public addConnectionStar(px: number, py: number, vx = this.generateStarSpeed(), vy = this.generateStarSpeed()) {
		// const star = this.addStar(px, py, vx, vy, Math.random() * (this.options.MAX_CONNECTION_RADIUS - this.options.MIN_CONNECTION_RADIUS) + this.options.MIN_CONNECTION_RADIUS)

		const star: ConnectionStar = {
			px,
			py,
			vx,
			vy,
			extraSpeedY: 0,
			extraSpeedX: 0,
			extraSpeedResistance: 0,
			alpha: 0,
			color: this.generateStarColor(),
			connectionRadius: this.options.MAX_CONNECTION_RADIUS,
			connectionOpacity: 0,
		}

		this.stars.push(star)
		this.connectionStars.push(star)
		this.nConnectionStars++
		this.nStars++
	}

	protected addFirstConnectionStar() {
		this.addConnectionStar(this.canvas.width / 2, this.canvas.height / 2)
	}

	protected spawnTick(nStarsToSpawn = 1) {
		if (this.nStars >= this.maximumStarPopulation) return

		if (this.nConnectionStars === 0) {
			this.addFirstConnectionStar()
		} else {
			for (let i = this.nConnectionStars - 1; i >= 0; i--) {
				const star = this.connectionStars[i]
				if (!star) throw new Error("Expected a star in the array at this position.")
				const px = star.px
				const py = star.py

				for (let ic = 0; ic < nStarsToSpawn; ic++) {
					if (this.nConnectionStars < this.maxConnectionStars) {
						if (star.alpha >= 1) this.addConnectionStar(px, py)
					} else {
						this.addStar(px, py)
					}
				}
			}
		}
	}

	public start() {
		super.start()
	}
}

class SpotifyStarfieldOptions {
	BEAT_STRENGTH = 15
	BEAT_RESISTANCE = 3
	BEAT_MIN_CONFIDENCE = 0.45
	COLORS = [
		// 0 = C, 1 = C♯/D♭, 2 = D, and so on
		["255,47,146", "255,49,148", "255,51,150"],
		["255,126,121"],
		["255,212,121"],
		["255,252,121"],
		["212,251,121"],
		["115,250,121"],
		["115,252,214"],
		["115,253,255"],
		["118,214,255"],
		["122,129,255"],
		["215,131,255"],
		["255,133,255"],
	]
}

interface SpotifyBeat {
	confidence: number
	duration: number
	start: number
}
interface SpotifySegment {
	start: number
	loudness_max: number
}
interface SpotifySection {
	start: number
	key: number
}
interface SpotifyTatum {
	confidence: number
	start: number
}
interface SpotifyTrack {
	item: {name: any; artists: {name: any}[]; id: string}
	is_playing: any
	progress_ms: number
}

interface SpotifyAnalysis {
	beats: SpotifyBeat[]
	segments: SpotifySegment[]
	sections: SpotifySection[]
	tatums: SpotifyTatum[]
}

class SpotifyStarfield extends Starfield {
	private token: string | undefined = hashFragment["access_token"]
	private spotifyOptions = new SpotifyStarfieldOptions()
	private $playerMeta = $("#player-meta")
	private $playerTime = $("#player-time")
	private segment!: SpotifySegment
	private section!: SpotifySection
	private startTime: number = performance.now()
	/** Current track ID. Undefined if not playing */
	private currentTrackID?: string
	private paused: boolean = false

	private isPlaying() {
		return !!this.currentTrackID
	}

	private async spotify(url: string): Promise<any> {
		const f = await fetch("https://api.spotify.com/v1" + url, {headers: {Authorization: "Bearer " + this.token}})
		const txt = await f.text()
		if (txt === "") return undefined
		const obj = JSON.parse(txt)
		if (obj.error) {
			if (obj.error.status === 401) {
				window.location.replace(`https://accounts.spotify.com/authorize?client_id=6ed539a873ed442fac572b7f679833a9&redirect_uri=${encodeURIComponent(location.origin)}&scope=user-read-playback-state%20user-read-private%20user-read-email&response_type=token&state=123`)
			} else {
				throw obj
			}
		}
		return obj
	}

	private async getAnalysis(trackId: string): Promise<SpotifyAnalysis> {
		return <SpotifyAnalysis>await this.spotify("/audio-analysis/" + trackId)
	}

	private hitBeat(beat: SpotifyBeat) {
		if (!this.nConnectionStars) return // bail if no connection stars
		for (let i = 0; i < this.nConnectionStars; i++) {
			const star = this.connectionStars[i]
			const v = this.spotifyOptions.BEAT_STRENGTH * beat.confidence
			star.extraSpeedY = star.vy > 0 ? v : -v // * star.vy
			star.extraSpeedX = star.vx > 0 ? v : -v // * star.vx
			// console.log("beat", beat, star, star.extraSpeedY)
			star.extraSpeedResistance = (1 - beat.duration) * this.spotifyOptions.BEAT_RESISTANCE
		}
	}

	private newSection(section: SpotifySection) {
		console.warn("Changed section", section)
		this.pallette = this.spotifyOptions.COLORS[section.key]
	}
	private newSegment(segment: SpotifySegment) {
		console.log("Changed segment", segment)
		this.pallette = this.spotifyOptions.COLORS[this.section.key]
		this.connectionRadiusProduct = 1 + Math.abs(segment.loudness_max) / 50
		this.spawnTick()
	}

	private async newTrack(track: SpotifyTrack) {
		const ttt = performance.now()
		console.log("New track!", track)

		applyTemplate(this.$playerMeta, {song: track.item.name, artist: track.item.artists[0].name})

		if (track.item.id) {
			console.log("Getting analysis...")
			const analysis = await this.getAnalysis(track.item.id)
			console.log(analysis)

			// Adjust timing, accounting for network latency
			track.progress_ms += performance.now() - ttt

			// remove all of the items that are already used
			const beats = analysis.beats.filter((beat: {start: number; confidence: number}) => track.progress_ms < beat.start * 1000 && beat.confidence > 0.15)
			const tatums = analysis.tatums.filter((tatum: {start: number; confidence: number}) => track.progress_ms < tatum.start * 1000 && tatum.confidence > this.spotifyOptions.BEAT_MIN_CONFIDENCE)
			const segments = analysis.segments.filter((segment: {start: number}) => track.progress_ms < segment.start * 1000)
			const sections = analysis.sections.filter((section: {start: number}) => track.progress_ms < section.start * 1000)

			// Init
			this.startTime = performance.now()
			this.segment = segments[0]
			this.section = sections[0]
			this.newSection(this.section)

			// Keep
			const spotifyBeatKeeper = () => {
				if (!this.paused) {
					const progress_ms = track.progress_ms + (performance.now() - this.startTime)
					if (beats.length) {
						if (progress_ms >= beats[0].start * 1000) {
							const beat = beats[0]
							beats.splice(0, 1)
							this.hitBeat(beat)
						}
					}

					if (tatums.length) {
						if (progress_ms >= tatums[0].start * 1000) {
							const tatum = tatums[0]
							tatums.splice(0, 1)
							this.spawnTick()
						}
					}

					if (segments[0] && progress_ms >= segments[0].start * 1000) {
						this.segment = segments[0]
						segments.splice(0, 1)
						this.newSegment(this.segment)
					}

					if (sections[0] && progress_ms >= sections[0].start * 1000) {
						this.section = sections[0]
						sections.splice(0, 1)
						this.newSection(this.section)
					}
					if (!this.section) debugger
				}

				requestAnimationFrame(spotifyBeatKeeper)
			}

			requestAnimationFrame(spotifyBeatKeeper)
		}
	}

	private async trackWatcher() {
		const track = await this.spotify("/me/player")
		if (!track) return

		const current =
			Math.floor(track.progress_ms / 1000 / 60) +
			":" +
			Math.floor((track.progress_ms / 1000) % 60)
				.toString()
				.padStart(2, "0")
		const end =
			Math.floor(track.item.duration_ms / 1000 / 60) +
			":" +
			Math.floor((track.item.duration_ms / 1000) % 60)
				.toString()
				.padStart(2, "0")
		applyTemplate(this.$playerTime, {current, end})

		if (track.item.id !== this.currentTrackID) {
			this.currentTrackID = track.item.id
			await this.newTrack(track)
		}

		if (track.is_playing) {
			// Start everything
			// for (let i = 0; i < 50; i++) addStar({px: Math.random() * canvas.width, py: Math.random() * canvas.height})
			this.addFirstConnectionStar()
			this.paused = false
		} else {
			this.paused = true
			//
		}
	}

	public start() {
		// On start...
		super.start()

		console.log("Started spotify visualizer with token:" + this.token)
		if (this.token) {
			setInterval(() => this.trackWatcher(), 3000)
			this.trackWatcher().then(() => {
				$("#login").hidden = true
			})
		} else {
		}
	}
}

;(function () {
	const c = new SpotifyStarfield()
	document.body.appendChild(c.canvas)
	c.start()

	$("a").setAttribute("href", `https://accounts.spotify.com/authorize?client_id=6ed539a873ed442fac572b7f679833a9&redirect_uri=${encodeURIComponent(location.origin)}&scope=user-read-playback-state%20user-read-private%20user-read-email&response_type=token&state=123`)
})()
