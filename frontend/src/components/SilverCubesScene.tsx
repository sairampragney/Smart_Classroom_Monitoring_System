import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

export const SilverCubesScene: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mountNode = mountRef.current
    if (!mountNode) return

    const width = mountNode.clientWidth || 300
    const height = mountNode.clientHeight || 300

    const scene = new THREE.Scene()
    scene.background = null

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.set(0, 0, 8)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mountNode.appendChild(renderer.domElement)

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambientLight)

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2)
    dirLight1.position.set(5, 8, 5)
    scene.add(dirLight1)

    const dirLight2 = new THREE.DirectionalLight(0xd8dce1, 0.8)
    dirLight2.position.set(-5, -5, -2)
    scene.add(dirLight2)

    // Material for Silver Cubes (#D8DCE1)
    const cubeMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8dce1,
      metalness: 0.2,
      roughness: 0.3,
    })

    // Geometry
    const geometry = new THREE.BoxGeometry(1.8, 1.8, 1.8)

    // Exactly two silver 3D cubes as required
    const cube1 = new THREE.Mesh(geometry, cubeMaterial)
    cube1.position.set(-1.2, 0.4, 0)
    cube1.rotation.set(0.4, 0.6, 0.2)
    scene.add(cube1)

    const cube2 = new THREE.Mesh(geometry, cubeMaterial)
    cube2.position.set(1.4, -0.5, -0.5)
    cube2.rotation.set(-0.3, 0.8, -0.4)
    scene.add(cube2)

    let animationFrameId: number

    const animate = () => {
      cube1.rotation.x += 0.005
      cube1.rotation.y += 0.008

      cube2.rotation.x -= 0.006
      cube2.rotation.y -= 0.007

      renderer.render(scene, camera)
      animationFrameId = requestAnimationFrame(animate)
    }

    animate()

    const handleResize = () => {
      if (!mountNode) return
      const w = mountNode.clientWidth
      const h = mountNode.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      if (mountNode.contains(renderer.domElement)) {
        mountNode.removeChild(renderer.domElement)
      }
      geometry.dispose()
      cubeMaterial.dispose()
      renderer.dispose()
    }
  }, [])

  return <div ref={mountRef} className="w-full h-full min-h-[280px] pointer-events-none" />
}
