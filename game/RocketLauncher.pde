class RocketLauncher extends Gun {
  
  RocketLauncher(PVector pos) {
    super(pos);
    
    
    shootTime = 50;
    shootTimer = shootTime;
    damage = 100;
    speed = 15;
    offset = -6;
    capacity = 1;
    ammo = capacity;
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
        bullets.add(new Rocket(new PVector(dir.x*speed, dir.y*speed), new PVector(p.pos.x + dir.x*10, p.pos.y + dir.y*30), 70/speed * 3, dir, "player", damage));
        if (powerupDuration[2] > 0)  explosions.add(new Explosion(new PVector(p.pos.x + dir.x*20, p.pos.y + dir.y*20), shellSize, color(255, 140, 0)));
        else explosions.add(new Explosion(new PVector(p.pos.x + dir.x*20, p.pos.y + dir.y*20), shellSize, color(28, 212, 196)));
        ammo --;
        canShoot = false;
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
      translate(p.pos.x + 6, p.pos.y + 1);
      if (dir.x >= 0) rotate(atan(dir.y/dir.x));
      else rotate(atan(dir.y/dir.x) + PI);
    
      noStroke();
      fill(165);
      triangle(-size*0.8, -size*0.25, -size*0.77, size*0.25, -size*0.4, 0);
      fill(145);
      rect(-size*0.6, -size*0.15, size*1.4, size*0.3);
      fill(100);
      rect(-size*0.1, -size*0.15, size*0.08, size*0.3);
      fill(90);
      rect(-size*0.2, -size*0.2, size*0.4, size*0.1, 5);
      rect(size*0.5, -size*0.18, size*0.3, size*0.36, 1);
      fill(120);
      quad(size*0.8, -size*0.18, size*0.8, size*0.18, size*0.9, size*0.23, size*0.9, -size*0.23);
      fill(145);
      rect(size*0.9, -size*0.23, size*0.1, size*0.46);
      if (powerupDuration[2] <= 0) fill(playerColor);
      else fill(255, 140, 0);
      if (ammo > 0 && canShoot == true) triangle(size, size*0.18, size, -size*0.18, size*1.2, 0);
      
      popMatrix();
    }
  }
}
