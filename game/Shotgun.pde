class Shotgun extends Gun {
  
  
  Shotgun(PVector pos) {
    super(pos);
    
    shootTime = 50;
    shootTimer = shootTime;
    damage = 15;
    speed = 25;
    offset = -6;
    capacity = 6;
    ammo = capacity;
    shellSize = 15;
    size = p.size;
  }
  
  void move() {
    
    if (!mobile)
      dir = new PVector(mouseX - p.pos.x, mouseY - p.pos.y);
    else if (closestEnemy != null)
      dir = new PVector(closestEnemy.pos.x = p.pos.x, closestEnemy.pos.y - p.pos.y);
    dir.normalize();
    
    if (carrying == true) {
      
      if (keyPressed && key == 'e' && canShoot == true && ammo > 0 && reloading == false) {
        bullets.add(new Bullet(new PVector(dir.x*speed + p.vel.x, dir.y*speed + p.vel.y), new PVector(p.pos.x + dir.x*10, p.pos.y + dir.y*30), 5, dir, "player", damage));
        bullets.add(new Bullet(new PVector(dir.x*speed + p.vel.x, dir.y*speed + p.vel.y), new PVector(p.pos.x + dir.x*5, p.pos.y + dir.y*10), 5, dir, "player", damage));
        explosions.add(new Explosion(new PVector(p.pos.x + dir.x*20, p.pos.y + dir.y*20), shellSize, color(28, 212, 196)));
        ammo --;
        canShoot = false;
        
        p.vel.add(new PVector(dir.x*-2, dir.y*-2));
      }
      
      if (keyPressed && key == 'w' && reloading == false) {
        reloading = true;
        reloadTimer = 80 - ammo/capacity*80;
      }
      
      if (reloading == true) {
        reloadTimer -= gameSpeed;
        
        if (reloadTimer < 0) {
          reloadTimer = 80;
          ammo = capacity;
          reloading = false;
        }
      }
      
      if (canShoot == false) {
        shootTimer -= gameSpeed;
        if (shootTimer < 0) {
          canShoot = true;
          shootTimer = shootTime;
        }
      }
      
    } else {
      
      if (dist(pos.x, pos.y, p.pos.x, p.pos.y) < 40)
        if (keyPressed && keyCode == SHIFT) {
          weapons.remove(carried);
          carrying = true;
          carried = this;
        }
    }
  }
  
  void display() {
    
    super.display();
    
    if (carrying == true) {
      pushMatrix();
      translate(p.pos.x, p.pos.y);
      if (dir.x >= 0) rotate(atan(dir.y/dir.x));
      else rotate(atan(dir.y/dir.x) + PI);
    
      noStroke();
      fill(140);
      rect(-size*0.3, -size*0.15, size*1.4, size*0.14, 5);
      rect(-size*0.3, size*0.15, size*1.4, -size*0.14, 5);
      fill(102, 60, 0);
      rect(-size*0.5, -size*0.16, size*0.6, size*0.32, 5);
      fill(160);
      ellipse(-size*0.3, 0, size*0.1, size*0.1);
      rect(0, -size*0.05, size*0.3, size*0.1, 5);
      
      popMatrix();
    }
  }
}
